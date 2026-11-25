-- ============================================================
-- Migración 003 — Historial de cambios de los modelos
-- Ejecutar en la BD de CADA CLIENTE (no en la maestra), después de la 002.
-- Cada vez que se guarda la ficha de un modelo queda un registro con
-- quién, cuándo, qué cambió, la justificación y la versión creada (si hubo).
-- Se puede ejecutar más de una vez sin efectos.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS model_changes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id          UUID NOT NULL REFERENCES ai_models(id),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by        UUID,
  changed_by_email  TEXT,
  justification     TEXT NOT NULL CHECK (length(trim(justification)) > 0),
  -- { "fields": { col: { "from": ..., "to": ... } }, "states": { col: { "from": ..., "to": ... } } }
  changes           JSONB NOT NULL DEFAULT '{}',
  version_id        UUID REFERENCES model_versions(id)
);

CREATE INDEX IF NOT EXISTS model_changes_model_idx ON model_changes (model_id, changed_at DESC);

COMMIT;
