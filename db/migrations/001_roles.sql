-- ============================================================
-- Migración 001 — Nuevos roles y división por usuario
-- Ejecutar UNA vez sobre la BD maestra.
-- NO ejecutar hasta que las APIs usen los nuevos roles (paso 4).
-- Ver docs/roles-y-accesos.md
-- ============================================================

BEGIN;

-- 1. Quitar la regla de roles antigua
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Renombrar roles actuales
UPDATE users SET role = 'super_empresa'    WHERE role = 'company_admin';
UPDATE users SET role = 'super_division'   WHERE role = 'branch_manager';
UPDATE users SET role = 'usuario_division' WHERE role = 'company_user';

-- 3. Nueva regla de roles
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_empresa','super_division','usuario_division'));

-- 4. División asignada (id de la tabla branches en la BD del cliente;
--    sin FK porque está en otra base de datos)
ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id UUID;

-- 5. Si existía la columna antigua branch_id, copiar su valor
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'users' AND column_name = 'branch_id') THEN
    UPDATE users SET division_id = branch_id::uuid
     WHERE division_id IS NULL AND branch_id IS NOT NULL;
  END IF;
END $$;

-- 6. super_empresa sin división; los otros dos roles con división.
--    NOT VALID: no revisa usuarios existentes, solo nuevos o editados.
ALTER TABLE users
  ADD CONSTRAINT users_division_check
  CHECK (
    (role = 'super_empresa' AND division_id IS NULL) OR
    (role IN ('super_division','usuario_division') AND division_id IS NOT NULL)
  ) NOT VALID;

COMMIT;
