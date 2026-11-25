-- ============================================================
-- Migración 004 (maestra) — Ajuste EU AI Act por empresa
-- Ejecutar UNA vez sobre la BD MAESTRA (postgres).
-- Activa o desactiva la sección "EU AI Act" (art. 73) en los incidentes de cada empresa.
-- Por defecto queda desactivado; se cambia desde el panel BION Admin.
-- Se puede ejecutar más de una vez sin efectos.
-- ============================================================

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS eu_ai_act_enabled BOOLEAN NOT NULL DEFAULT false;

COMMIT;
