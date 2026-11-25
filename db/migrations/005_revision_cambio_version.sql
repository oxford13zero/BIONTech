-- ============================================================
-- Migración 005 — Revisión del cambio de versión (gestión del cambio)
-- Ejecutar en la BD de CADA CLIENTE (no en la maestra), después de la 004.
-- Reemplaza el simple "Riesgo revisado": cada revisión guarda qué cambió, si es
-- sustancial, qué afecta, cómo se probó, qué controles se ajustaron, plan de
-- vuelta atrás, período de vigilancia y la decisión de riesgo justificada.
-- Marcos: ISO/IEC 42001 (6.3, 8.1), ISO 45001 (8.1.3), NIST AI RMF (MANAGE), EU AI Act (modificación sustancial).
-- Se puede ejecutar más de una vez sin efectos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS instance_version_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id           UUID NOT NULL REFERENCES ai_instances(id),
  version_id            UUID REFERENCES model_versions(id),     -- versión revisada (la vigente al revisar)
  previous_version_id   UUID REFERENCES model_versions(id),     -- versión anterior
  what_changed          TEXT,
  substantial           TEXT NOT NULL CHECK (substantial IN ('si','no','no_se_sabe')),
  affected_aspects      TEXT[] NOT NULL DEFAULT '{}',  -- funciones_seguridad, autonomia, interaccion_personas, sensores_datos, umbrales, pantalla_operador
  tests                 TEXT[] NOT NULL DEFAULT '{}',  -- piloto, pruebas_faena, validacion_proveedor, sin_pruebas
  test_result           TEXT,
  evidence_url          TEXT,
  controls              TEXT[] NOT NULL DEFAULT '{}',  -- capacitacion, procedimientos, supervision_humana, ninguno
  rollback_plan         TEXT NOT NULL CHECK (rollback_plan IN ('si','no','no_se_sabe')),
  monitoring_days       INTEGER NOT NULL CHECK (monitoring_days IN (15, 30, 60, 90)),
  monitoring_until      DATE NOT NULL,
  risk_level            TEXT NOT NULL CHECK (risk_level IN ('Low','Medium','High','Critical')),
  approved_by           TEXT,
  justification         TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  reviewed_by           UUID,
  reviewed_by_email     TEXT,
  reviewed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Si hay un incidente grave durante la vigilancia, la instalación vuelve a "Riesgo por revisar"
  reopened_at           TIMESTAMPTZ,
  reopened_by_incident  UUID REFERENCES ai_incidents(id)
);

CREATE INDEX IF NOT EXISTS instance_version_reviews_idx ON instance_version_reviews (instance_id, reviewed_at DESC);

COMMIT;
