"""
generate_data.py
────────────────
Generates a synthetic dataset of 10,000 historical patient appointments
and writes it to  ai_service/data/appointments.csv.

Features
────────
  patient_age           – Age in years (18–90)
  distance_km           – Distance to hospital in kilometres (0.5–80)
  previous_no_shows     – Count of past no-shows (0–10)
  weather_condition     – Categorical: clear / rain / snow / storm
  appointment_hour      – Hour of day the appointment is scheduled (7–18)
  days_until_appt       – Days between booking and appointment date (0–90)
  reminder_sent         – Binary: 1 if a reminder was sent, 0 otherwise
  chronic_conditions    – Count of chronic conditions the patient has (0–5)
  insurance_type        – Categorical: none / public / private
  did_no_show           – TARGET  1 = patient did not show up, 0 = showed up

No-show probability is constructed with realistic, explainable weights so
the model can actually learn meaningful relationships.
"""

import os
import numpy as np
import pandas as pd

# ── Reproducibility ─────────────────────────────────────────────────────────────
SEED = 42
rng  = np.random.default_rng(SEED)

N = 10_000   # number of appointment records

# ── 1. Feature Generation ────────────────────────────────────────────────────────
patient_age        = rng.integers(18, 91, size=N).astype(float)
distance_km        = rng.uniform(0.5, 80, size=N).round(2)
previous_no_shows  = rng.integers(0, 11, size=N).astype(float)
appointment_hour   = rng.integers(7, 19, size=N).astype(float)   # 7 AM – 6 PM
days_until_appt    = rng.integers(0, 91, size=N).astype(float)
reminder_sent      = rng.integers(0, 2,  size=N).astype(float)   # binary
chronic_conditions = rng.integers(0, 6,  size=N).astype(float)

weather_options    = ["clear", "rain", "snow", "storm"]
weather_weights    = [0.55,    0.25,   0.12,   0.08]
weather_condition  = rng.choice(weather_options, size=N, p=weather_weights)

insurance_options  = ["private", "public", "none"]
insurance_weights  = [0.55,      0.35,     0.10]
insurance_type     = rng.choice(insurance_options, size=N, p=insurance_weights)

# ── 2. Construct Realistic No-Show Probability ───────────────────────────────────
#   Logistic function applied to a weighted linear combination of features.
#   Signs mirror clinical intuition:
#     + more previous no-shows   → higher risk
#     + farther distance         → higher risk
#     + bad weather              → higher risk
#     + longer lead time         → higher risk (forgotten appointment)
#     − reminder sent            → lower risk
#     − older patient            → slightly lower risk (more health-conscious)
#     − early morning slot       → slightly lower risk (less congestion)

weather_risk = np.select(
    [weather_condition == "storm",
     weather_condition == "snow",
     weather_condition == "rain"],
    [1.4, 0.9, 0.4],
    default=0.0,
)

insurance_risk = np.select(
    [insurance_type == "none",
     insurance_type == "public"],
    [0.6, 0.2],
    default=0.0,
)

log_odds = (
    -1.5                                          # intercept (baseline)
    + 0.18  * previous_no_shows                   # history is the strongest predictor
    + 0.012 * distance_km                         # farther → harder to come
    - 0.008 * patient_age                         # older patients more compliant
    + 0.008 * days_until_appt                     # forgotten if booked far ahead
    - 0.55  * reminder_sent                       # reminders help significantly
    + 0.05  * chronic_conditions                  # more conditions → more engaged
    + weather_risk                                # weather penalty
    + insurance_risk                              # insurance coverage penalty
    - 0.03  * (appointment_hour - 12)             # morning slots preferred
    + rng.normal(0, 0.25, size=N)                 # noise
)

no_show_prob = 1 / (1 + np.exp(-log_odds))
did_no_show  = (rng.uniform(size=N) < no_show_prob).astype(int)

# ── 3. Assemble DataFrame ────────────────────────────────────────────────────────
df = pd.DataFrame({
    "patient_age":        patient_age,
    "distance_km":        distance_km,
    "previous_no_shows":  previous_no_shows,
    "weather_condition":  weather_condition,
    "appointment_hour":   appointment_hour,
    "days_until_appt":    days_until_appt,
    "reminder_sent":      reminder_sent,
    "chronic_conditions": chronic_conditions,
    "insurance_type":     insurance_type,
    "did_no_show":        did_no_show,
})

# ── 4. Save ──────────────────────────────────────────────────────────────────────
os.makedirs("data", exist_ok=True)
output_path = os.path.join("data", "appointments.csv")
df.to_csv(output_path, index=False)

print(f"✅  Dataset saved → {output_path}")
print(f"    Shape          : {df.shape}")
print(f"    No-show rate   : {df['did_no_show'].mean():.2%}")
print(f"\nColumn dtypes:\n{df.dtypes}")
print(f"\nFirst 5 rows:\n{df.head()}")
