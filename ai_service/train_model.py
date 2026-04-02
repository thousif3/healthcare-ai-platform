"""
train_model.py
──────────────
Trains an XGBoost (with Random Forest as fallback) binary classifier to
predict patient no-shows.  Saves the full scikit-learn pipeline as a .pkl
file for use by the FastAPI service.

Usage (run from the ai_service/ directory):
    python train_model.py

Outputs
───────
  models/no_show_model.pkl   – Serialised Pipeline (preprocessor + classifier)
  models/feature_names.json  – Ordered list of raw feature names expected by /predict
"""

import os
import json
import pickle
import warnings
import numpy as np
import pandas as pd

from sklearn.model_selection   import train_test_split, StratifiedKFold, cross_val_score
from sklearn.pipeline          import Pipeline
from sklearn.compose           import ColumnTransformer
from sklearn.preprocessing     import StandardScaler, OneHotEncoder
from sklearn.metrics           import (
    roc_auc_score, classification_report, confusion_matrix, brier_score_loss
)

warnings.filterwarnings("ignore")

# ── Configuration ────────────────────────────────────────────────────────────────
DATA_PATH       = os.path.join("data", "appointments.csv")
MODEL_DIR       = "models"
MODEL_PATH      = os.path.join(MODEL_DIR, "no_show_model.pkl")
FEATURES_PATH   = os.path.join(MODEL_DIR, "feature_names.json")
MODEL_VERSION   = "v1.0.0"
RANDOM_STATE    = 42
TEST_SIZE       = 0.20     # 20 % held-out test set

# Feature schema
NUMERIC_FEATURES = [
    "patient_age",
    "distance_km",
    "previous_no_shows",
    "appointment_hour",
    "days_until_appt",
    "reminder_sent",
    "chronic_conditions",
]

CATEGORICAL_FEATURES = [
    "weather_condition",
    "insurance_type",
]

TARGET = "did_no_show"

# ── 1. Load Data ─────────────────────────────────────────────────────────────────
print("─" * 60)
print(f"Loading data from: {DATA_PATH}")
df = pd.read_csv(DATA_PATH)
print(f"  Shape: {df.shape}  |  No-show rate: {df[TARGET].mean():.2%}")

X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES]
y = df[TARGET]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
)
print(f"  Train: {len(X_train)}  |  Test: {len(X_test)}")

# ── 2. Preprocessing Pipeline ────────────────────────────────────────────────────
numeric_transformer = Pipeline([
    ("scaler", StandardScaler()),
])

categorical_transformer = Pipeline([
    ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
])

preprocessor = ColumnTransformer([
    ("num", numeric_transformer,     NUMERIC_FEATURES),
    ("cat", categorical_transformer, CATEGORICAL_FEATURES),
])

# ── 3. Classifier — XGBoost preferred, sklearn RF as fallback ────────────────────
try:
    from xgboost import XGBClassifier
    classifier = XGBClassifier(
        n_estimators      = 400,
        max_depth         = 6,
        learning_rate     = 0.05,
        subsample         = 0.8,
        colsample_bytree  = 0.8,
        reg_alpha         = 0.1,
        reg_lambda        = 1.0,
        use_label_encoder = False,
        eval_metric       = "logloss",
        random_state      = RANDOM_STATE,
        n_jobs            = -1,
    )
    CLASSIFIER_NAME = "XGBoostClassifier"
except ImportError:
    from sklearn.ensemble import RandomForestClassifier
    classifier = RandomForestClassifier(
        n_estimators = 400,
        max_depth    = 12,
        min_samples_split = 10,
        class_weight = "balanced",
        random_state = RANDOM_STATE,
        n_jobs       = -1,
    )
    CLASSIFIER_NAME = "RandomForestClassifier (xgboost not installed)"

print(f"\nClassifier: {CLASSIFIER_NAME}")

# ── 4. Build & Train Full Pipeline ───────────────────────────────────────────────
print("─" * 60)
print("Training pipeline…")

pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier",   classifier),
])

pipeline.fit(X_train, y_train)
print("  ✅  Training complete.")

# ── 5. Evaluation ────────────────────────────────────────────────────────────────
print("─" * 60)
print("Evaluating on held-out test set…")

y_pred      = pipeline.predict(X_test)
y_proba     = pipeline.predict_proba(X_test)[:, 1]

roc_auc     = roc_auc_score(y_test, y_proba)
brier       = brier_score_loss(y_test, y_proba)

print(f"\n  ROC-AUC Score : {roc_auc:.4f}")
print(f"  Brier Score   : {brier:.4f}  (lower = better, 0 = perfect)")
print(f"\n  Confusion Matrix:\n{confusion_matrix(y_test, y_pred)}")
print(f"\n  Classification Report:\n{classification_report(y_test, y_pred)}")

# ── 6. Cross-Validation (5-fold) ─────────────────────────────────────────────────
print("─" * 60)
print("Running 5-fold stratified cross-validation on training data…")
cv      = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
cv_auc  = cross_val_score(pipeline, X_train, y_train, cv=cv,
                           scoring="roc_auc", n_jobs=-1)
print(f"  CV ROC-AUC: {cv_auc.mean():.4f} ± {cv_auc.std():.4f}")

# ── 7. Feature Importance (top 15) ───────────────────────────────────────────────
try:
    ohe_cols   = pipeline.named_steps["preprocessor"] \
                         .named_transformers_["cat"] \
                         .named_steps["ohe"] \
                         .get_feature_names_out(CATEGORICAL_FEATURES)
    all_features = NUMERIC_FEATURES + list(ohe_cols)

    clf = pipeline.named_steps["classifier"]
    importances = getattr(clf, "feature_importances_", None)
    if importances is not None:
        fi = (
            pd.Series(importances, index=all_features)
              .sort_values(ascending=False)
              .head(15)
        )
        print(f"\n  Top-15 Feature Importances:\n{fi.to_string()}")
except Exception:
    pass   # Non-fatal — skip if OHE shape differs

# ── 8. Persist Model & Feature Manifest ──────────────────────────────────────────
os.makedirs(MODEL_DIR, exist_ok=True)

with open(MODEL_PATH, "wb") as f:
    pickle.dump(pipeline, f, protocol=pickle.HIGHEST_PROTOCOL)

feature_manifest = {
    "version":             MODEL_VERSION,
    "numeric_features":    NUMERIC_FEATURES,
    "categorical_features": CATEGORICAL_FEATURES,
    "all_raw_features":    NUMERIC_FEATURES + CATEGORICAL_FEATURES,
    "target":              TARGET,
    "roc_auc_test":        round(roc_auc, 4),
    "brier_test":          round(brier, 4),
    "cv_roc_auc_mean":     round(float(cv_auc.mean()), 4),
    "cv_roc_auc_std":      round(float(cv_auc.std()),  4),
}

with open(FEATURES_PATH, "w") as f:
    json.dump(feature_manifest, f, indent=2)

print("─" * 60)
print(f"✅  Model saved  → {MODEL_PATH}")
print(f"✅  Manifest     → {FEATURES_PATH}")
print(f"    ROC-AUC (test): {roc_auc:.4f}")
