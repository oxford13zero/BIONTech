// ============================================================
// Reglas comunes de activos, modelos e instancias
// Diseño: docs/activos-y-modelos.md
// ============================================================

const ASSET_TYPES  = ['equipo', 'instalacion', 'proceso'];
const AI_USAGE     = ['usa_ia', 'modelos_por_identificar', 'por_confirmar'];
const RISK_LEVELS  = ['Critical', 'High', 'Medium', 'Low'];
const RISK_ORDER   = { Low: 1, Medium: 2, High: 3, Critical: 4 };

// Campos editables de un activo
const ASSET_FIELDS = [
  'code', 'name', 'asset_type', 'branch_id', 'manufacturer', 'equipment_model',
  'area', 'ai_usage', 'commissioned_at', 'notes'
];

function badRequest(message) { return { status: 400, message }; }

// Id de usuario válido para los campos "creado por" (si no es UUID, se guarda vacío)
const asUuid = v => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const today = () => new Date().toISOString().slice(0, 10);

function assertDate(v, field) {
  if (v !== null && v !== undefined && !isDate(v)) throw badRequest(`Invalid date: ${field}`);
}

function assertOneOf(v, list, field) {
  if (v !== null && v !== undefined && !list.includes(v)) throw badRequest(`Invalid value: ${field}`);
}

function assertGroup(v, field = 'inventory_group') {
  if (v === null || v === undefined) return;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw badRequest(`Invalid value: ${field}`);
}

// La división pertenece a la empresa
async function assertBranch(db, companyId, branchId) {
  if (!branchId) throw badRequest('Division required');
  const r = await db.query('SELECT id FROM branches WHERE id::text = $1 AND company_id = $2', [String(branchId), companyId]);
  if (!r.rows[0]) throw { status: 404, message: 'Division not found' };
}

// Versión más reciente publicada de un modelo
async function latestVersion(db, modelId) {
  const r = await db.query(
    `SELECT id FROM model_versions WHERE model_id = $1 ORDER BY released_at DESC, created_at DESC LIMIT 1`, [modelId]
  );
  return r.rows[0]?.id || null;
}

// Crea una instancia de un modelo en un activo (regla 1 del diseño):
// versión vigente del modelo, riesgo base del modelo y grupo sugerido (o el indicado).
async function createInstance(db, { companyId, modelId, assetId, branchId, installedAt, group, userId }) {
  const m = await db.query('SELECT id, base_risk_level, suggested_group, status FROM ai_models WHERE id::text = $1 AND company_id = $2',
    [String(modelId), companyId]);
  const model = m.rows[0];
  if (!model) throw { status: 404, message: 'Model not found' };
  if (model.status !== 'activo') throw badRequest('Model is retired');

  const inventoryGroup = group ?? model.suggested_group;
  if (!inventoryGroup) throw badRequest('Group required (the model has no suggested group)');
  assertGroup(inventoryGroup);
  const installed = installedAt || today();
  assertDate(installed, 'installed_at');

  const versionId = await latestVersion(db, model.id);
  const r = await db.query(
    `INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, code`,
    [companyId, model.id, assetId, branchId, Number(inventoryGroup), versionId, installed, model.base_risk_level]
  );
  const inst = r.rows[0];
  if (versionId) {
    await db.query(
      `INSERT INTO instance_versions (instance_id, version_id, valid_from, created_by) VALUES ($1, $2, $3, $4)`,
      [inst.id, versionId, installed, asUuid(userId)]
    );
  }
  return inst;
}

// Crea un modelo con ficha corta (y su primera versión si se indica)
async function createShortModel(db, { companyId, name, vendor, version, releasedAt, baseRisk, suggestedGroup, userId }) {
  if (!name || !String(name).trim() || !vendor || !String(vendor).trim()) throw badRequest('Model name and vendor required');
  assertOneOf(baseRisk ?? null, RISK_LEVELS, 'base_risk_level');
  assertGroup(suggestedGroup ?? null, 'suggested_group');
  assertDate(releasedAt ?? null, 'released_at');
  const r = await db.query(
    `INSERT INTO ai_models (company_id, name, vendor, base_risk_level, suggested_group) VALUES ($1, $2, $3, $4, $5) RETURNING id, code`,
    [companyId, String(name).trim(), String(vendor).trim(), baseRisk || null, suggestedGroup ? Number(suggestedGroup) : null]
  );
  const model = r.rows[0];
  if (version && String(version).trim()) {
    await db.query(
      `INSERT INTO model_versions (model_id, version, released_at, created_by) VALUES ($1, $2, $3, $4)`,
      [model.id, String(version).trim(), releasedAt || today(), asUuid(userId)]
    );
  }
  return model;
}

// Ejecuta fn dentro de una transacción; si algo falla, no queda nada a medias
async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Errores de la BD → respuestas claras
function dbError(e) {
  if (e && e.status) return e;
  if (e && e.code === '23505') return { status: 409, message: 'Duplicate code' };
  if (e && e.code === '23514') return { status: 400, message: 'Invalid value' };
  if (e && e.code === '22P02') return { status: 400, message: 'Invalid identifier' };
  return e;
}

module.exports = {
  ASSET_TYPES, AI_USAGE, RISK_LEVELS, RISK_ORDER, ASSET_FIELDS,
  badRequest, isDate, today, assertDate, assertOneOf, assertGroup, assertBranch,
  latestVersion, createInstance, createShortModel, inTransaction, dbError, asUuid
};
