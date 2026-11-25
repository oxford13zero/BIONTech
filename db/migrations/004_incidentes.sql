-- ============================================================
-- Migración 004 — Incidentes: registro CSET/OECD, investigación e ISO 42001
-- Ejecutar en la BD de CADA CLIENTE (no en la maestra), después de la 003.
-- Para la BD maestra ver 004_incidentes_maestra.sql (ajuste EU AI Act por empresa).
-- Diseño: docs/incidentes.md
--   · Estados: solo 'abierto' y 'cerrado' (los 'en_investigacion' pasan a 'abierto')
--   · Tipo (OECD): 'incidente' (daño real) o 'peligro' (hazard; incluye cuasi incidentes)
--   · Gravedad (OECD): 'incidente', 'incidente_grave', 'desastre'
--   · Acciones correctivas en tabla propia (incident_actions)
-- Se puede ejecutar más de una vez sin efectos.
-- ============================================================

BEGIN;

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

-- Quién registró y quién cerró (email, para mostrarlo en la ficha)
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS reported_by_email    TEXT;
ALTER TABLE ai_incidents ADD COLUMN IF NOT EXISTS closed_by_email      TEXT;

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

COMMIT;
