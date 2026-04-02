"""
ai_service.py
─────────────
FastAPI microservice — No-Show Prediction AI

Endpoints
─────────
  GET  /              – Health check
  GET  /health        – Detailed health (model loaded, version, etc.)
  POST /predict       – Predict no-show probability for a single appointment

Prediction flow
───────────────
  1.  Accept patient/appointment features in the request body.
  2.  Run the loaded scikit-learn Pipeline to produce a probability.
  3.  Derive a risk tier (low / medium / high / critical) from the score.
  4.  Fire-and-forget: PATCH http://localhost:5000/api/appointments/{id}/score
      to persist the score in the PostgreSQL database via the Node.js API.
  5.  Return the full prediction response to the caller.

Run
───
  uvicorn ai_service:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import pickle
import json
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# ── Logging ──────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("ai_service")

# ── Config ───────────────────────────────────────────────────────────────────────
MODEL_PATH         = os.getenv("MODEL_PATH",      os.path.join("models", "no_show_model.pkl"))
FEATURES_PATH      = os.getenv("FEATURES_PATH",   os.path.join("models", "feature_names.json"))
NODE_BASE_URL      = os.getenv("NODE_BASE_URL",   "http://localhost:5000")
SCORE_PATCH_PATH   = "/api/appointments/{appointment_id}/score"
HTTP_TIMEOUT_S     = float(os.getenv("HTTP_TIMEOUT_S", "5.0"))

# Risk-tier thresholds
RISK_TIERS = [
    (0.75, "critical"),
    (0.50, "high"),
    (0.25, "medium"),
    (0.00, "low"),
]

# ── Load Model at startup ─────────────────────────────────────────────────────────
log.info("Loading model from %s …", MODEL_PATH)

try:
    with open(MODEL_PATH, "rb") as f:
        MODEL_PIPELINE = pickle.load(f)
    log.info("Model loaded successfully.")
except FileNotFoundError:
    log.error(
        "Model file not found at '%s'. "
        "Run train_model.py first to generate the model.",
        MODEL_PATH,
    )
    MODEL_PIPELINE = None

try:
    with open(FEATURES_PATH, "r") as f:
        FEATURE_MANIFEST = json.load(f)
    MODEL_VERSION = FEATURE_MANIFEST.get("version", "unknown")
    log.info("Feature manifest loaded. Model version: %s", MODEL_VERSION)
except FileNotFoundError:
    FEATURE_MANIFEST = {}
    MODEL_VERSION    = "unknown"
    log.warning("Feature manifest not found — using default version string.")

# ── FastAPI App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "Healthcare AI — No-Show Prediction Service",
    description = (
        "Predicts the probability that a patient will not attend a scheduled appointment. "
        "Automatically writes the score back to the Node.js/PostgreSQL backend."
    ),
    version     = MODEL_VERSION,
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Pydantic Schemas ──────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    """
    All features required to produce a no-show prediction.
    appointment_id is optional; if provided the score is written
    back to the Node.js database automatically.
    """
    appointment_id:    Optional[str] = Field(None, description="UUID of the appointment (optional — enables DB write-back)")

    # Numeric features
    patient_age:       float = Field(..., ge=0,  le=130,  description="Patient age in years")
    distance_km:       float = Field(..., ge=0,           description="Distance from home to hospital in km")
    previous_no_shows: float = Field(..., ge=0,           description="Number of past no-shows")
    appointment_hour:  float = Field(..., ge=0,  le=23,   description="Hour of day for the appointment (24 h)")
    days_until_appt:   float = Field(..., ge=0,           description="Days between booking date and appointment date")
    reminder_sent:     float = Field(..., ge=0,  le=1,    description="1 if a reminder was sent, 0 otherwise")
    chronic_conditions:float = Field(..., ge=0,           description="Number of chronic health conditions")

    # Categorical features
    weather_condition: str  = Field(..., description="Expected weather: clear | rain | snow | storm")
    insurance_type:    str  = Field(..., description="Insurance coverage: private | public | none")

    @field_validator("weather_condition")
    @classmethod
    def validate_weather(cls, v: str) -> str:
        allowed = {"clear", "rain", "snow", "storm"}
        if v.lower() not in allowed:
            raise ValueError(f"weather_condition must be one of: {allowed}")
        return v.lower()

    @field_validator("insurance_type")
    @classmethod
    def validate_insurance(cls, v: str) -> str:
        allowed = {"private", "public", "none"}
        if v.lower() not in allowed:
            raise ValueError(f"insurance_type must be one of: {allowed}")
        return v.lower()

    model_config = {
        "json_schema_extra": {
            "example": {
                "appointment_id":     "550e8400-e29b-41d4-a716-446655440000",
                "patient_age":        45,
                "distance_km":        12.5,
                "previous_no_shows":  2,
                "appointment_hour":   10,
                "days_until_appt":    14,
                "reminder_sent":      1,
                "chronic_conditions": 1,
                "weather_condition":  "clear",
                "insurance_type":     "private",
            }
        }
    }


class PredictResponse(BaseModel):
    appointment_id:      Optional[str]
    no_show_probability: float
    risk_tier:           str
    model_version:       str
    scored_at:           str
    db_write_back:       bool      # True if PATCH to Node.js succeeded
    db_write_back_status: Optional[int]  # HTTP status from Node.js


# ── Helper: Classify Risk Tier ────────────────────────────────────────────────────
def classify_risk_tier(probability: float) -> str:
    for threshold, tier in RISK_TIERS:
        if probability >= threshold:
            return tier
    return "low"


# ── Helper: Fire-and-Forget PATCH to Node.js ─────────────────────────────────────
async def patch_appointment_score(
    appointment_id: str,
    no_show_probability: float,
    model_version: str,
) -> tuple[bool, Optional[int]]:
    """
    Sends a PATCH request to the Node.js backend to persist the score.
    Returns (success: bool, http_status: int | None).
    """
    url     = NODE_BASE_URL + SCORE_PATCH_PATH.format(appointment_id=appointment_id)
    payload = {
        "no_show_probability": no_show_probability,
        "model_version":       model_version,
    }

    log.info("Writing score to Node.js → PATCH %s  (p=%.4f)", url, no_show_probability)

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
            response = await client.patch(url, json=payload)
            response.raise_for_status()
            log.info("Node.js write-back succeeded  status=%d", response.status_code)
            return True, response.status_code
    except httpx.HTTPStatusError as exc:
        log.error(
            "Node.js returned error  status=%d  body=%s",
            exc.response.status_code, exc.response.text[:200],
        )
        return False, exc.response.status_code
    except httpx.RequestError as exc:
        log.error("Network error reaching Node.js: %s", exc)
        return False, None


# ── Endpoints ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Healthcare AI — No-Show Prediction",
        "version": MODEL_VERSION,
        "status":  "running",
        "docs":    "/docs",
    }


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status":        "ok" if MODEL_PIPELINE is not None else "degraded",
        "model_loaded":  MODEL_PIPELINE is not None,
        "model_version": MODEL_VERSION,
        "node_backend":  NODE_BASE_URL,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    }


@app.post(
    "/predict",
    response_model = PredictResponse,
    status_code    = status.HTTP_200_OK,
    tags           = ["Prediction"],
    summary        = "Predict no-show probability for a patient appointment",
)
async def predict(request: PredictRequest):
    """
    ### Prediction Flow

    1.  Validate incoming features.
    2.  Build a one-row DataFrame matching the training schema.
    3.  Run the scikit-learn pipeline (`predict_proba`).
    4.  Derive a risk tier.
    5.  If `appointment_id` is provided → PATCH the Node.js score endpoint.
    6.  Return the full prediction response.
    """
    if MODEL_PIPELINE is None:
        raise HTTPException(
            status_code = status.HTTP_503_SERVICE_UNAVAILABLE,
            detail      = "Model is not loaded. Run train_model.py first.",
        )

    # ── Build input DataFrame ────────────────────────────────────────────────────
    input_data = pd.DataFrame([{
        "patient_age":        request.patient_age,
        "distance_km":        request.distance_km,
        "previous_no_shows":  request.previous_no_shows,
        "appointment_hour":   request.appointment_hour,
        "days_until_appt":    request.days_until_appt,
        "reminder_sent":      request.reminder_sent,
        "chronic_conditions": request.chronic_conditions,
        "weather_condition":  request.weather_condition,
        "insurance_type":     request.insurance_type,
    }])

    # ── Run inference ────────────────────────────────────────────────────────────
    try:
        no_show_probability = float(MODEL_PIPELINE.predict_proba(input_data)[0, 1])
    except Exception as exc:
        log.exception("Inference failed: %s", exc)
        raise HTTPException(
            status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail      = f"Model inference error: {exc}",
        )

    risk_tier  = classify_risk_tier(no_show_probability)
    scored_at  = datetime.now(timezone.utc).isoformat()

    log.info(
        "Prediction  appointment_id=%s  p=%.4f  tier=%s",
        request.appointment_id, no_show_probability, risk_tier,
    )

    # ── Write-back to Node.js (async, if appointment_id supplied) ────────────────
    db_success, db_status = False, None

    if request.appointment_id:
        db_success, db_status = await patch_appointment_score(
            appointment_id      = request.appointment_id,
            no_show_probability = no_show_probability,
            model_version       = MODEL_VERSION,
        )

    return PredictResponse(
        appointment_id       = request.appointment_id,
        no_show_probability  = round(no_show_probability, 6),
        risk_tier            = risk_tier,
        model_version        = MODEL_VERSION,
        scored_at            = scored_at,
        db_write_back        = db_success,
        db_write_back_status = db_status,
    )
