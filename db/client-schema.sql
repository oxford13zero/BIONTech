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
  deployment_status             TEXT,
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
  foreseeable_misuse    TEXT
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
  additional_regulations TEXT,
  eu_ai_act_article      TEXT,
  gpai_flag              TEXT
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
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  training_data_volume      TEXT,
  includes_community_data   TEXT,
  includes_confidential_data TEXT,
  last_retrain_date         DATE,
  data_owner                TEXT,
  data_stored_on_provider   TEXT,
  data_processing_region    TEXT,
  data_processing_agreement TEXT,
  data_transfer_location    TEXT
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
  sensor_monitoring_active    BOOLEAN DEFAULT false
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
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  docs_accessible_for_audit    TEXT,
  market_regulator_disclosure  TEXT,
  next_contract_renewal        DATE,
  annex_iv_complete            BOOLEAN DEFAULT false,
  ce_marking_declared          BOOLEAN DEFAULT false,
  vendor_questionnaire_received BOOLEAN DEFAULT false,
  independent_review_completed BOOLEAN DEFAULT false,
  legal_review_completed       BOOLEAN DEFAULT false,
  board_approval_required      BOOLEAN DEFAULT false,
  log_retention_months         INTEGER DEFAULT 6,
  log_integrity_method         TEXT,
  fria_completed               TEXT
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

-- Section H — Accountability & Governance
CREATE TABLE IF NOT EXISTS sec_accountability (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id                UUID UNIQUE NOT NULL REFERENCES ai_systems(id) ON DELETE CASCADE,
  ai_owner_business        TEXT,
  ai_owner_technical       TEXT,
  eu_ai_act_role           TEXT CHECK (eu_ai_act_role IN ('Provider','Deployer','Distributor')),
  approved_by              TEXT,
  approval_date            DATE,
  ethics_reviewer          TEXT,
  data_protection_contact  TEXT,
  escalation_contact       TEXT,
  board_informed           TEXT CHECK (board_informed IN ('Si','No','En proceso')),
  review_cycle             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- ============================================================
-- Activos, modelos e instancias (copia de db/migrations/002_activos_modelos.sql)
-- Diseño: docs/activos-y-modelos.md
-- ============================================================

-- Códigos automáticos: MOD-001, INS-0001
CREATE SEQUENCE IF NOT EXISTS ai_model_code_seq;
CREATE SEQUENCE IF NOT EXISTS ai_instance_code_seq;

-- ── Activos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL,
  branch_id        UUID NOT NULL REFERENCES branches(id),
  code             TEXT NOT NULL,
  name             TEXT NOT NULL,
  asset_type       TEXT NOT NULL CHECK (asset_type IN ('equipo','instalacion','proceso')),
  manufacturer     TEXT,
  equipment_model  TEXT,
  area             TEXT,
  ai_usage         TEXT NOT NULL DEFAULT 'usa_ia'
                   CHECK (ai_usage IN ('usa_ia','modelos_por_identificar','por_confirmar')),
  status           TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','retirado')),
  commissioned_at  DATE,
  retired_at       DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- ── Catálogo de modelos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_models (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    UUID NOT NULL,
  code                          TEXT NOT NULL DEFAULT ('MOD-' || lpad(nextval('ai_model_code_seq')::text, 3, '0')),
  name                          TEXT NOT NULL,
  vendor                        TEXT NOT NULL,
  suggested_group               SMALLINT CHECK (suggested_group BETWEEN 1 AND 4),
  base_risk_level               TEXT CHECK (base_risk_level IN ('Critical','High','Medium','Low')),
  black_box                     BOOLEAN NOT NULL DEFAULT false,
  vendor_questionnaire_sent_at  DATE,
  vendor_questionnaire_received BOOLEAN NOT NULL DEFAULT false,
  -- B (proveedor)
  main_function                 TEXT,
  output_type                   TEXT,
  output_format                 TEXT,
  -- C (proveedor)
  gpai_flag                     TEXT,
  -- D (proveedor)
  model_type                    TEXT,
  training_data_sources         TEXT,
  training_data_volume          TEXT,
  last_retrain_date             DATE,
  retrain_frequency             TEXT,
  data_quality_control          TEXT,
  vendor_provides_tech_access   TEXT,
  data_stored_on_provider       TEXT,
  data_processing_region        TEXT,
  data_processing_agreement     TEXT,
  data_transfer_location        TEXT,
  -- E (proveedor)
  performance_metrics           TEXT,
  baseline_comparison           TEXT,
  bias_evaluated                TEXT,
  bias_type                     TEXT,
  bias_result                   TEXT,
  independent_validation        TEXT,
  -- G (proveedor)
  technical_docs_exist          TEXT,
  ce_marking_declared           BOOLEAN NOT NULL DEFAULT false,
  annex_iv_complete             BOOLEAN NOT NULL DEFAULT false,
  next_contract_renewal         DATE,
  -- Estado de cada campo: { "campo": "pendiente" | "no_entregado" }
  field_status                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                        TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','retirado')),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

-- ── Versiones publicadas de un modelo ─────────────────────────
CREATE TABLE IF NOT EXISTS model_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         UUID NOT NULL REFERENCES ai_models(id) ON DELETE CASCADE,
  version          TEXT NOT NULL,
  released_at      DATE NOT NULL,
  change_notes     TEXT,
  changes_unknown  BOOLEAN NOT NULL DEFAULT false,   -- el proveedor actualizó sin informar qué cambió
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_id, version),
  UNIQUE (model_id, id)                               -- para asegurar que la versión es del mismo modelo
);

-- ── Instancias: un modelo instalado en un activo ──────────────
CREATE TABLE IF NOT EXISTS ai_instances (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL,
  code                        TEXT NOT NULL DEFAULT ('INS-' || lpad(nextval('ai_instance_code_seq')::text, 4, '0')),
  model_id                    UUID NOT NULL REFERENCES ai_models(id),
  asset_id                    UUID REFERENCES assets(id),          -- vacío = activo por asignar
  branch_id                   UUID NOT NULL REFERENCES branches(id),
  inventory_group             SMALLINT NOT NULL CHECK (inventory_group BETWEEN 1 AND 4),
  current_version_id          UUID,
  installed_at                DATE,
  risk_level                  TEXT CHECK (risk_level IN ('Critical','High','Medium','Low')),
  reclassification_pending    BOOLEAN NOT NULL DEFAULT false,
  compliance_status           TEXT NOT NULL DEFAULT 'Sin evaluar',
  status                      TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','retirada')),
  retired_at                  DATE,
  -- A (uso)
  responsible_person          TEXT,
  responsible_area            TEXT,
  operational_location        TEXT,
  country                     TEXT DEFAULT 'Chile',
  next_review_date            DATE,
  autonomy_level              SMALLINT CHECK (autonomy_level BETWEEN 1 AND 5),
  eu_ai_act_risk_category     TEXT,
  environment                 TEXT CHECK (environment IN ('Cloud','On-premise','Edge','Hybrid')),
  infrastructure_provider     TEXT,
  shadow_ai_label             TEXT DEFAULT 'Declarado',
  risk_score_total            NUMERIC(4,2),
  deployment_status           TEXT,
  -- B (uso)
  autonomous_decision         TEXT,
  decision_speed              TEXT,
  execution_frequency         TEXT,
  recommends_or_decides       TEXT,
  who_acts_on_output          TEXT,
  impact_if_fails             TEXT,
  affected_processes          TEXT,
  affected_equipment          TEXT,
  people_in_impact_area       TEXT,
  can_cause_physical_harm     TEXT,
  feeds_public_reports        TEXT,
  foreseeable_misuse          TEXT,
  -- C (uso)
  risk_level_chile            TEXT,
  articles_chile              TEXT,
  articles_peru               TEXT,
  articles_brazil             TEXT,
  applies_sernageomin         TEXT,
  requires_human_supervision  TEXT,
  additional_regulations      TEXT,
  nist_alignment              TEXT,
  nist_functions              TEXT,
  oecd_alignment              TEXT,
  oecd_principles             TEXT,
  iso42001_alignment          TEXT,
  iso42001_principles         TEXT,
  other_frameworks            TEXT,
  eu_ai_act_article           TEXT,
  -- D (uso)
  production_input_data       TEXT,
  includes_personal_data      TEXT,
  includes_sensitive_data     TEXT,
  includes_community_data     TEXT,
  includes_confidential_data  TEXT,
  data_owner                  TEXT,
  -- E (uso)
  drift_monitoring            TEXT,
  last_performance_report     DATE,
  incident_reporting_process  TEXT,
  field_status                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code),
  -- La versión instalada debe pertenecer al mismo modelo
  FOREIGN KEY (model_id, current_version_id) REFERENCES model_versions (model_id, id)
);

-- ── Historial de versiones por instancia ──────────────────────
CREATE TABLE IF NOT EXISTS instance_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  version_id   UUID NOT NULL REFERENCES model_versions(id),
  valid_from   DATE NOT NULL,
  valid_to     DATE,                                   -- vacío = vigente
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
-- Solo una versión vigente por instancia
CREATE UNIQUE INDEX IF NOT EXISTS instance_versions_one_current
  ON instance_versions (instance_id) WHERE valid_to IS NULL;

-- ── Secciones por instancia (1 fila por instancia) ────────────
CREATE TABLE IF NOT EXISTS inst_risk_operational (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                 UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  human_override_exists       TEXT,
  override_response_time_sec  INTEGER,
  failure_mode                TEXT,
  incidents_recorded          TEXT,
  review_frequency            TEXT,
  last_review_date            DATE,
  field_status                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_risk_decision (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id              UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  human_validation_exists  TEXT,
  validation_process_desc  TEXT,
  decision_log_exists      TEXT,
  incidents_attributed     TEXT,
  review_frequency         TEXT,
  field_status             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_risk_strategic (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                   UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  geological_validation         TEXT,
  used_in_reserve_reports       TEXT,
  influences_public_investment  TEXT,
  community_communication       TEXT,
  committed_investment_usd      NUMERIC(14,2),
  field_status                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_risk_human_use (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                   UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  use_policy_exists             TEXT,
  employees_signed_policy_pct   NUMERIC(5,2),
  mandatory_training            TEXT,
  trained_employees_pct         NUMERIC(5,2),
  misuse_cases_detected         TEXT,
  ai_allowed_legal_docs         TEXT,
  ai_allowed_regulator_reports  TEXT,
  field_status                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_compliance (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                    UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  algorithmic_impact_assessment  TEXT,
  decision_log_exists            TEXT,
  log_externally_auditable       TEXT,
  next_regulatory_review         DATE,
  compliance_responsible         TEXT,
  docs_accessible_for_audit      TEXT,
  approved_use_policy            TEXT,
  board_informed                 TEXT,
  market_regulator_disclosure    TEXT,
  fria_completed                 TEXT,
  independent_review_completed   BOOLEAN NOT NULL DEFAULT false,
  legal_review_completed         BOOLEAN NOT NULL DEFAULT false,
  board_approval_required        BOOLEAN NOT NULL DEFAULT false,
  log_retention_months           INTEGER,
  log_integrity_method           TEXT,
  field_status                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_accountability (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id              UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  ai_owner_business        TEXT,
  ai_owner_technical       TEXT,
  eu_ai_act_role           TEXT CHECK (eu_ai_act_role IN ('Provider','Deployer','Distributor')),
  approved_by              TEXT,
  approval_date            DATE,
  ethics_reviewer          TEXT,
  data_protection_contact  TEXT,
  escalation_contact       TEXT,
  board_informed           TEXT CHECK (board_informed IN ('Si','No','En proceso')),
  review_cycle             TEXT,
  field_status             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_risk_assessment (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id               UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  assessment_code           TEXT,
  methodology               TEXT,
  probability_scale         TEXT,
  residual_risk_level       TEXT CHECK (residual_risk_level IN ('Aceptable','Condicional','No aceptable')),
  mitigation_controls       TEXT,
  contingency_plan          TEXT,
  next_mandatory_review     DATE,
  evaluator_name            TEXT,
  management_approval_name  TEXT,
  drift_status              TEXT CHECK (drift_status IN ('OK','Warning','Alert')),
  monitoring_frequency      TEXT,
  field_status              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inst_human_supervision (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                    UUID UNIQUE NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  autonomy_level_approved        SMALLINT CHECK (autonomy_level_approved BETWEEN 1 AND 5),
  autonomy_approved_by           TEXT,
  kill_switch_mechanism          TEXT,
  kill_switch_response_time_sec  INTEGER,
  kill_switch_last_tested        DATE,
  kill_switch_test_result        TEXT CHECK (kill_switch_test_result IN ('Aprobado','Fallido','Pendiente')),
  kill_switch_next_test          DATE,
  escalation_thresholds          TEXT,
  override_auto_logged           BOOLEAN,
  override_audit_frequency       TEXT,
  degraded_mode_behavior         TEXT,
  field_status                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- M7: varias integraciones por instancia
CREATE TABLE IF NOT EXISTS inst_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id       UUID NOT NULL REFERENCES ai_instances(id) ON DELETE CASCADE,
  integration_name  TEXT NOT NULL,
  vendor            TEXT,
  integration_type  TEXT,
  auth_method       TEXT,
  sync_frequency    TEXT,
  last_sync_at      TIMESTAMPTZ,
  last_sync_status  TEXT CHECK (last_sync_status IN ('OK','Warning','Error','Never')),
  offline_capable   BOOLEAN NOT NULL DEFAULT false,
  priority          TEXT CHECK (priority IN ('CRÍTICA','ALTA','MEDIA','BAJA')),
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Copias de fichas (al cambiar de versión) ──────────────────
CREATE TABLE IF NOT EXISTS record_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('modelo','instancia')),
  entity_id    UUID NOT NULL,
  version_id   UUID REFERENCES model_versions(id),
  reason       TEXT NOT NULL,
  data         JSONB NOT NULL,
  taken_by     UUID,
  taken_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Incidentes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_incidents (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                       UUID NOT NULL,
  branch_id                        UUID NOT NULL REFERENCES branches(id),
  asset_id                         UUID NOT NULL REFERENCES assets(id),
  instance_id                      UUID REFERENCES ai_instances(id),   -- vacío = modelo por determinar
  version_id                       UUID REFERENCES model_versions(id), -- automático
  occurred_at                      DATE NOT NULL,
  title                            TEXT NOT NULL,
  description                      TEXT,
  incident_type                    TEXT,
  kind                             TEXT NOT NULL DEFAULT 'incidente' CHECK (kind IN ('incidente','cuasi_incidente')),
  severity                         TEXT NOT NULL CHECK (severity IN ('leve','moderado','grave','critico')),
  eu_serious_incident              BOOLEAN NOT NULL DEFAULT false,
  status                           TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','en_investigacion','cerrado')),
  root_cause_technical             TEXT,
  root_cause_organizational        TEXT,
  lessons_learned                  TEXT,
  requires_regulator_notification  BOOLEAN NOT NULL DEFAULT false,
  regulator_authority              TEXT,
  notification_deadline            DATE,
  reported_by                      UUID,
  instance_assigned_at             TIMESTAMPTZ,
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices de búsqueda ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS assets_branch_idx         ON assets (branch_id);
CREATE INDEX IF NOT EXISTS ai_instances_model_idx    ON ai_instances (model_id);
CREATE INDEX IF NOT EXISTS ai_instances_asset_idx    ON ai_instances (asset_id);
CREATE INDEX IF NOT EXISTS ai_instances_branch_idx   ON ai_instances (branch_id);
CREATE INDEX IF NOT EXISTS instance_versions_idx     ON instance_versions (instance_id, valid_from);
CREATE INDEX IF NOT EXISTS ai_incidents_asset_idx    ON ai_incidents (asset_id, occurred_at);
CREATE INDEX IF NOT EXISTS ai_incidents_instance_idx ON ai_incidents (instance_id);
CREATE INDEX IF NOT EXISTS record_snapshots_idx      ON record_snapshots (entity_type, entity_id);

-- ============================================================
-- Historial de cambios de los modelos (copia de db/migrations/003_historial_modelos.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS model_changes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID NOT NULL REFERENCES ai_models(id),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by        UUID,
  changed_by_email  TEXT,
  justification     TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  changes           JSONB NOT NULL DEFAULT '{}',
  version_id        UUID REFERENCES model_versions(id)
);
CREATE INDEX IF NOT EXISTS model_changes_model_idx ON model_changes (model_id, changed_at DESC);

-- ============================================================
-- Incidentes: registro CSET/OECD, investigación e ISO 42001
-- (copia de db/migrations/004_incidentes.sql)
-- ============================================================
-- ── 1. Quitar las reglas antiguas de tipo, gravedad y estado ──
ALTER TABLE ai_incidents DROP CONSTRAINT IF EXISTS ai_incidents_kind_check;
ALTER TABLE ai_incidents DROP CONSTRAINT IF EXISTS ai_incidents_severity_check;
ALTER TABLE ai_incidents DROP CONSTRAINT IF EXISTS ai_incidents_status_check;

-- ── 2. Convertir los datos existentes ─────────────────────────
UPDATE ai_incidents SET kind = 'peligro' WHERE kind = 'cuasi_incidente';
UPDATE ai_incidents SET severity = 'incidente'       WHERE severity IN ('leve', 'moderado');
UPDATE ai_incidents SET severity = 'incidente_grave' WHERE severity IN ('grave', 'critico');
UPDATE ai_incidents SET status = 'abierto' WHERE status = 'en_investigacion';

-- ── 3. Reglas nuevas ──────────────────────────────────────────
ALTER TABLE ai_incidents ALTER COLUMN severity SET DEFAULT 'incidente';
ALTER TABLE ai_incidents ADD CONSTRAINT ai_incidents_kind_check     CHECK (kind IN ('incidente','peligro'));
ALTER TABLE ai_incidents ADD CONSTRAINT ai_incidents_severity_check CHECK (severity IN ('incidente','incidente_grave','desastre'));
ALTER TABLE ai_incidents ADD CONSTRAINT ai_incidents_status_check   CHECK (status IN ('abierto','cerrado'));

-- ── 4. Campos nuevos ──────────────────────────────────────────
-- Registro · paso 1 (CSET): la IA, lo dañado y el evento
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS occurred_time        TIME;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS harmed_targets       TEXT[] NOT NULL DEFAULT '{}';  -- personas, equipo_vehiculo, instalacion, mismo_activo, medio_ambiente, datos
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS harmed_description   TEXT;                          -- ¿cuál? (ej. camioneta PU-22)
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS ai_behavior          TEXT;                          -- actuo_mal, no_detecto, mal_uso, no_claro
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS ai_link              TEXT;                          -- causo, contribuyo, no_claro

-- Registro · paso 2 (OECD): el daño
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS harm_types           TEXT[] NOT NULL DEFAULT '{}';  -- fisico_salud, psicologico, economico, reputacional, ambiental, interes_publico, derechos_humanos, propiedad_intelectual
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS country              TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS location             TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS evidence_links       JSONB  NOT NULL DEFAULT '[]';  -- [{ "label": ..., "url": ... }]

-- Investigación · personas y derechos (OECD)
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS affected_groups      TEXT[] NOT NULL DEFAULT '{}';  -- trabajadores, consumidores, grupos_vulnerables, empresas, publico
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS injured_count        INTEGER CHECK (injured_count IS NULL OR injured_count >= 0);
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS oecd_principles      TEXT[] NOT NULL DEFAULT '{}';  -- bienestar, derechos_equidad_privacidad, transparencia, robustez_seguridad, rendicion_cuentas

-- Investigación · contexto y técnica (OECD). Se precargan desde el inventario y se confirman.
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS sector               TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS deployment_scope     TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS data_issues          TEXT[] NOT NULL DEFAULT '{}';  -- sesgados, erroneos, no_representativos, sin_consentimiento, no_se_sabe
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS model_type           TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS explainability       TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS robustness_failure   TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS ai_task              TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS autonomy             TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS human_oversight      TEXT;

-- Investigación · EU AI Act art. 73 (solo empresas con el ajuste activado)
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS eu_criteria          TEXT[] NOT NULL DEFAULT '{}';  -- muerte_salud, infraestructura_critica, derechos_fundamentales, propiedad_ambiente
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS eu_notified_at       DATE;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS eu_notification_ref  TEXT;

-- Investigación · respuesta y cierre (OECD + ISO 42001 10.2)
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS measures_taken       TEXT[] NOT NULL DEFAULT '{}';  -- corrigio, alerta, retiro, investigacion_legal
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS effectiveness_check  TEXT;                          -- ¿las acciones funcionaron?
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS closed_at            TIMESTAMPTZ;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS closed_by            UUID;

-- ── 5. Acciones correctivas (ISO 42001 10.2) ──────────────────
CREATE TABLE IF NOT EXISTS incident_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  UUID NOT NULL REFERENCES ai_incidents(id),
  action       TEXT NOT NULL CHECK (length(trim(action)) > 0),
  owner        TEXT NOT NULL CHECK (length(trim(owner)) > 0),   -- responsable (cargo o nombre)
  due_date     DATE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','terminada')),
  done_at      DATE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS incident_actions_incident_idx ON incident_actions (incident_id);
-- Acciones vencidas (para Pendientes): pendiente y con fecha pasada
CREATE INDEX IF NOT EXISTS incident_actions_due_idx ON incident_actions (due_date) WHERE status = 'pendiente';
