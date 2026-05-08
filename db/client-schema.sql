-- ============================================================
-- BION Client Database Schema
-- This runs automatically when a new client database is provisioned
-- Each client gets their own isolated copy of this schema
-- ============================================================

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  name        TEXT NOT NULL,
  address     TEXT,
  country     TEXT DEFAULT 'Chile',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles (client users in their own DB)
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL,
  company_id    UUID NOT NULL,
  full_name     TEXT,
  email         TEXT,
  role          TEXT DEFAULT 'company_user',
  password_hash VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Systems
CREATE TABLE IF NOT EXISTS ai_systems (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL,
  branch_id                   UUID REFERENCES branches(id),
  system_code                 TEXT NOT NULL,
  name                        TEXT NOT NULL,
  inventory_group             SMALLINT NOT NULL CHECK (inventory_group BETWEEN 1 AND 4),
  vendor                      TEXT,
  version                     TEXT,
  deploy_date                 DATE,
  responsible_person          TEXT,
  responsible_area            TEXT,
  operational_location        TEXT,
  platform                    TEXT,
  country                     TEXT DEFAULT 'Chile',
  risk_level                  TEXT CHECK (risk_level IN ('Critical','High','Medium','Low')),
  compliance_status           TEXT DEFAULT 'Sin evaluar',
  next_review_date            DATE,
  status                      TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  -- v4 fields
  autonomy_level              SMALLINT CHECK (autonomy_level BETWEEN 1 AND 5),
  eu_ai_act_risk_category     TEXT,
  environment                 TEXT CHECK (environment IN ('Cloud','On-premise','Edge','Hybrid')),
  infrastructure_provider     TEXT,
  shadow_ai_label             TEXT DEFAULT 'Declarado',
  eu_ai_act_applicable        BOOLEAN DEFAULT false,
  annex_iii_applicable        BOOLEAN DEFAULT false,
  ce_marking_required         BOOLEAN DEFAULT false,
  risk_score_total            NUMERIC(4,2),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section A already in ai_systems above
-- Section B — Functional
CREATE TABLE IF NOT EXISTS sec_functional (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id             UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  main_function         TEXT,
  output_type           TEXT,
  output_format         TEXT,
  execution_frequency   TEXT,
  recommends_or_decides TEXT,
  who_acts_on_output    TEXT,
  impact_if_fails       TEXT,
  can_cause_physical_harm TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  autonomous_decision   TEXT,
  decision_speed        TEXT,
  affected_equipment    TEXT,
  people_in_impact_area TEXT,
  affected_processes    TEXT,
  feeds_public_reports  TEXT,
);

-- Section C — Regulatory
CREATE TABLE IF NOT EXISTS sec_regulatory (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                   UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  risk_level_chile            TEXT,
  articles_chile              TEXT,
  applies_sernageomin         TEXT,
  requires_human_supervision  TEXT,
  nist_alignment              TEXT,
  oecd_alignment              TEXT,
  iso42001_alignment          TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  articles_peru                    TEXT,
  articles_brazil                  TEXT,
  affects_market_regulator_reports TEXT,
  applies_environmental_regulation TEXT,
  nist_functions                   TEXT,
  oecd_principles                  TEXT,
  iso42001_principles              TEXT,
  other_frameworks                 TEXT,
  eu_ai_act_article6_applicable    BOOLEAN DEFAULT false,
  machinery_directive_applicable   BOOLEAN DEFAULT false,
  affects_cmf_reports              BOOLEAN DEFAULT false,
);

-- Section D — Data Engineering
CREATE TABLE IF NOT EXISTS sec_data_engineering (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                   UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  model_type                  TEXT,
  training_data_sources       TEXT,
  production_input_data       TEXT,
  includes_personal_data      TEXT,
  includes_sensitive_data     TEXT,
  retrain_frequency           TEXT,
  data_quality_control        TEXT,
  vendor_provides_tech_access TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section E — Performance
CREATE TABLE IF NOT EXISTS sec_performance (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                 UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  performance_metrics       TEXT,
  baseline_comparison       TEXT,
  drift_monitoring          TEXT,
  bias_evaluated            TEXT,
  bias_result               TEXT,
  incident_count            INTEGER DEFAULT 0,
  incident_reporting_process TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_performance_report     DATE,
  bias_type                   TEXT,
  baseline_metrics_defined    BOOLEAN DEFAULT false,
  data_drift_detected         BOOLEAN DEFAULT false,
  model_drift_detected        BOOLEAN DEFAULT false,
  prediction_outliers_detected BOOLEAN DEFAULT false,
  last_retraining_date        DATE,
  retraining_approval_process TEXT,
  sensor_monitoring_active    BOOLEAN DEFAULT false,
);

-- Section F — Risk (Operational)
CREATE TABLE IF NOT EXISTS sec_risk_operational (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                 UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  human_override_exists     TEXT,
  override_response_time_sec INTEGER,
  failure_mode              TEXT,
  incidents_recorded        TEXT,
  review_frequency          TEXT,
  last_review_date          DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section F — Risk (Decision)
CREATE TABLE IF NOT EXISTS sec_risk_decision (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                 UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  human_validation_exists   TEXT,
  validation_process_desc   TEXT,
  decision_log_exists       TEXT,
  incidents_attributed      TEXT,
  review_frequency          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section F — Risk (Strategic)
CREATE TABLE IF NOT EXISTS sec_risk_strategic (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                   UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  geological_validation       TEXT,
  used_in_reserve_reports     TEXT,
  influences_public_investment TEXT,
  community_communication     TEXT,
  committed_investment_usd    NUMERIC(14,2),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section F — Risk (Human Use)
CREATE TABLE IF NOT EXISTS sec_risk_human_use (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                   UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  use_policy_exists           TEXT,
  employees_signed_policy_pct NUMERIC(5,2),
  mandatory_training          TEXT,
  trained_employees_pct       NUMERIC(5,2),
  misuse_cases_detected       TEXT,
  ai_allowed_legal_docs       TEXT,
  ai_allowed_regulator_reports TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Section G — Compliance Docs
CREATE TABLE IF NOT EXISTS sec_compliance_docs (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                       UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  algorithmic_impact_assessment   TEXT,
  decision_log_exists             TEXT,
  log_externally_auditable        TEXT,
  next_regulatory_review          DATE,
  compliance_status               TEXT,
  compliance_responsible          TEXT,
  technical_docs_exist            TEXT,
  approved_use_policy             TEXT,
  board_informed                  TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M2 — Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id             UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  assessment_code       TEXT NOT NULL,
  methodology           TEXT,
  probability_scale     TEXT,
  residual_risk_level   TEXT CHECK (residual_risk_level IN ('Aceptable','Condicional','No aceptable')),
  mitigation_controls   TEXT,
  contingency_plan      TEXT,
  next_mandatory_review DATE,
  evaluator_name        TEXT,
  management_approval_name TEXT,
  drift_status          TEXT CHECK (drift_status IN ('OK','Warning','Alert')),
  monitoring_frequency  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M4 — Human Supervision
CREATE TABLE IF NOT EXISTS human_supervision (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                     UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  autonomy_level_approved       SMALLINT,
  autonomy_approved_by          TEXT,
  kill_switch_mechanism         TEXT,
  kill_switch_response_time_sec INTEGER,
  kill_switch_last_tested       DATE,
  kill_switch_test_result       TEXT CHECK (kill_switch_test_result IN ('Aprobado','Fallido','Pendiente')),
  kill_switch_next_test         DATE,
  escalation_thresholds         TEXT,
  override_auto_logged          BOOLEAN DEFAULT TRUE,
  override_audit_frequency      TEXT,
  degraded_mode_behavior        TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M6 — Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                      UUID NOT NULL,
  system_id                       UUID REFERENCES ai_systems(id) ON DELETE SET NULL,
  incident_code                   TEXT NOT NULL,
  incident_type                   TEXT,
  description                     TEXT NOT NULL,
  root_cause_technical            TEXT,
  root_cause_organizational       TEXT,
  requires_regulator_notification BOOLEAN DEFAULT FALSE,
  regulator_authority             TEXT,
  notification_deadline           DATE,
  lessons_learned                 TEXT,
  status                          TEXT DEFAULT 'ABIERTO',
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M7 — System Integrations
CREATE TABLE IF NOT EXISTS system_integrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id           UUID NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  integration_name    TEXT NOT NULL,
  vendor              TEXT,
  integration_type    TEXT,
  auth_method         TEXT,
  last_sync_at        TIMESTAMPTZ,
  last_sync_status    TEXT CHECK (last_sync_status IN ('OK','Warning','Error','Never')),
  sync_frequency      TEXT,
  offline_capable     BOOLEAN DEFAULT FALSE,
  priority            TEXT CHECK (priority IN ('CRÍTICA','ALTA','MEDIA','BAJA')),
  status              TEXT DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Legislation Alerts
CREATE TABLE IF NOT EXISTS legislation_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country       TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  url           TEXT,
  active        BOOLEAN DEFAULT TRUE,
  published_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
