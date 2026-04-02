-- =============================================================================
-- Healthcare AI Platform — Database Schema (Phase 1)
-- =============================================================================
-- Role-Based Access Control (RBAC) Design:
--   app_admin    → Full DDL + DML access (schema migrations, user management)
--   app_provider → SELECT / INSERT / UPDATE on patients, appointments
--   app_viewer   → SELECT-only access on patients, appointments (read-only dashboards)
--   app_ai_svc   → SELECT on patients; UPDATE no_show_probability on appointments
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID primary keys
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- Password hashing utilities

-- ---------------------------------------------------------------------------
-- 1. RBAC — Database Roles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Admin role
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin NOLOGIN;
  END IF;

  -- Provider role (clinicians, schedulers)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_provider') THEN
    CREATE ROLE app_provider NOLOGIN;
  END IF;

  -- Viewer role (read-only analysts, auditors)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_viewer') THEN
    CREATE ROLE app_viewer NOLOGIN;
  END IF;

  -- AI service role (ML inference microservice)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ai_svc') THEN
    CREATE ROLE app_ai_svc NOLOGIN;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Table: patients
--    Stores demographic, contact, and medical-history data for each patient.
--    PII fields (dob, phone, email) should be encrypted at-rest in production
--    using column-level encryption or Transparent Data Encryption (TDE).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  -- Primary key (UUID prevents enumeration attacks)
  patient_id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Demographics
  first_name          VARCHAR(100)    NOT NULL,
  last_name           VARCHAR(100)    NOT NULL,
  date_of_birth       DATE            NOT NULL,         -- PII — encrypt in prod
  gender              VARCHAR(20),                      -- 'Male','Female','Non-binary','Prefer not to say'
  ethnicity           VARCHAR(50),                      -- for health equity analytics

  -- Contact information (PII — encrypt in prod)
  email               VARCHAR(255)    UNIQUE,
  phone               VARCHAR(30),
  preferred_contact   VARCHAR(10)     DEFAULT 'email'   -- 'email' | 'phone' | 'sms'
                        CHECK (preferred_contact IN ('email', 'phone', 'sms')),

  -- Address
  address_line1       VARCHAR(255),
  address_line2       VARCHAR(255),
  city                VARCHAR(100),
  state               CHAR(2),
  zip_code            VARCHAR(10),

  -- Medical history / risk factors (used as AI model features)
  insurance_provider  VARCHAR(100),
  insurance_id        VARCHAR(50),
  primary_care_prov   UUID,                             -- FK to providers table (Phase 2)
  chronic_conditions  TEXT[],                           -- e.g. ARRAY['diabetes','hypertension']
  previous_no_shows   INT             NOT NULL DEFAULT 0 CHECK (previous_no_shows >= 0),
  previous_visits     INT             NOT NULL DEFAULT 0 CHECK (previous_visits >= 0),
  distance_to_clinic  NUMERIC(6,2),                     -- miles; feature for AI model
  has_transportation  BOOLEAN         DEFAULT TRUE,

  -- Record metadata
  is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes for common patient queries
CREATE INDEX IF NOT EXISTS idx_patients_last_name   ON patients (last_name);
CREATE INDEX IF NOT EXISTS idx_patients_dob         ON patients (date_of_birth);
CREATE INDEX IF NOT EXISTS idx_patients_zip         ON patients (zip_code);
CREATE INDEX IF NOT EXISTS idx_patients_is_active   ON patients (is_active);

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Table: appointments
--    Stores scheduling data and the AI model's no-show risk score.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  -- Primary key
  appointment_id      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relationships
  patient_id          UUID            NOT NULL
                        REFERENCES patients(patient_id) ON DELETE CASCADE,
  provider_id         UUID            NOT NULL,         -- FK to providers table (Phase 2)

  -- Scheduling
  scheduled_at        TIMESTAMPTZ     NOT NULL,         -- UTC date/time of appointment
  duration_minutes    INT             NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  appointment_type    VARCHAR(50)     NOT NULL,         -- 'in-person' | 'telehealth' | 'follow-up'
                        CHECK (appointment_type IN ('in-person', 'telehealth', 'follow-up', 'procedure')),
  department          VARCHAR(100),                     -- e.g. 'Cardiology', 'Primary Care'
  location            VARCHAR(100),                     -- clinic / room identifier

  -- Outcome tracking
  status              VARCHAR(20)     NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'no-show', 'completed')),
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  completed_at        TIMESTAMPTZ,

  -- Reminder / outreach tracking
  reminder_sent       BOOLEAN         NOT NULL DEFAULT FALSE,
  reminder_sent_at    TIMESTAMPTZ,
  reminder_channel    VARCHAR(10)                       -- 'email' | 'sms' | 'phone'
                        CHECK (reminder_channel IN ('email', 'sms', 'phone')),

  -- -------------------------------------------------------------------------
  -- AI No-Show Prediction (core Phase 1 feature)
  --   no_show_probability: float in [0.0, 1.0] produced by the ML model.
  --   Values are written by app_ai_svc after inference; NULL until scored.
  --   Thresholds for intervention tiers are defined in application config.
  --     ≥ 0.75 → High Risk   (proactive phone call + reschedule offer)
  --     0.5–0.74 → Medium    (automated SMS / email reminder)
  --     < 0.5  → Low Risk    (standard reminder)
  -- -------------------------------------------------------------------------
  no_show_probability NUMERIC(5,4)                      -- e.g. 0.8321; NULL = not yet scored
                        CHECK (no_show_probability IS NULL
                            OR (no_show_probability >= 0 AND no_show_probability <= 1)),
  risk_tier           VARCHAR(10)
                        GENERATED ALWAYS AS (
                          CASE
                            WHEN no_show_probability IS NULL  THEN 'unscored'
                            WHEN no_show_probability >= 0.75  THEN 'high'
                            WHEN no_show_probability >= 0.50  THEN 'medium'
                            ELSE                                   'low'
                          END
                        ) STORED,                       -- computed column, no manual writes
  scored_at           TIMESTAMPTZ,
  model_version       VARCHAR(30),                      -- tracks which model version produced score

  -- Record metadata
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Indexes for common appointment queries
CREATE INDEX IF NOT EXISTS idx_appts_patient_id       ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appts_provider_id      ON appointments (provider_id);
CREATE INDEX IF NOT EXISTS idx_appts_scheduled_at     ON appointments (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appts_status           ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_appts_risk_tier        ON appointments (risk_tier);
-- Partial index: only unscored upcoming appointments (AI scoring queue)
CREATE INDEX IF NOT EXISTS idx_appts_unscored_upcoming
  ON appointments (scheduled_at)
  WHERE no_show_probability IS NULL AND status = 'scheduled';

-- Auto-update updated_at trigger for appointments
CREATE OR REPLACE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RBAC — Privilege Grants
-- ---------------------------------------------------------------------------

-- app_admin: full access (revoke from app_admin if using superuser instead)
GRANT ALL PRIVILEGES ON TABLE patients, appointments TO app_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_admin;

-- app_provider: read + write on both tables (no DELETE on patients — soft-delete via is_active)
GRANT SELECT, INSERT, UPDATE ON TABLE patients     TO app_provider;
GRANT SELECT, INSERT, UPDATE ON TABLE appointments TO app_provider;

-- app_viewer: read-only
GRANT SELECT ON TABLE patients, appointments TO app_viewer;

-- app_ai_svc: read patients for feature extraction; update scores on appointments only
GRANT SELECT ON TABLE patients TO app_ai_svc;
GRANT SELECT ON TABLE appointments TO app_ai_svc;
-- Restrict ai_svc UPDATE to scoring columns only (Row-Level Security or view recommended in prod)
GRANT UPDATE (no_show_probability, scored_at, model_version) ON TABLE appointments TO app_ai_svc;

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security (RLS) — Stub for Phase 2
--    Enable RLS so providers only see their own patients' appointments.
--    Uncomment and complete once the users / providers table exists.
-- ---------------------------------------------------------------------------
-- ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY provider_isolation ON appointments
--   USING (provider_id = current_setting('app.current_provider_id')::UUID);

COMMENT ON TABLE patients IS
  'Core demographics, contact info, and historical features used by the no-show AI model.';
COMMENT ON TABLE appointments IS
  'Appointment scheduling records including AI-generated no_show_probability scores.';
COMMENT ON COLUMN appointments.no_show_probability IS
  'Float [0,1] output by ML model. NULL = not yet scored. Written by app_ai_svc role.';
COMMENT ON COLUMN appointments.risk_tier IS
  'Computed column: high (≥0.75), medium (≥0.50), low (<0.50), or unscored.';
