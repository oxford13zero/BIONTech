// ============================================================
// Versiones de modelos — /api/versions
//   POST /api/versions                        registrar versión
//        { model_id, version, released_at?, change_notes?, changes_unknown?,
//          apply_to: { mode: 'none'|'all'|'filter'|'list', manufacturer?, division?, asset_type?, instance_ids? },
//          installed_at?, dry_run? }
//   POST /api/versions?id=&action=apply      aplicar una versión ya registrada a más instancias
//        { apply_to, installed_at?, dry_run? }
// dry_run = true: solo devuelve qué instancias quedarían afectadas (vista previa), sin cambiar nada.
// Diseño: docs/activos-y-modelos.md, regla 2 y 3
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, sendError } = require('./_auth');
const I = require('./_inventory');

const MODES = ['none', 'all', 'filter', 'list'];

async function loadModel(db, user, modelId) {
  const r = await db.query('SELECT * FROM ai_models WHERE id::text = $1 AND company_id = $2', [String(modelId || ''), user.companyId]);
  const m = r.rows[0];
  if (!m) throw { status: 404, message: 'Model not found' };
  if (m.status !== 'activo') throw I.badRequest('Model is retired');
  return m;
}

// Instancias activas del modelo según "¿a qué instancias se aplica?"
async function selectInstances(db, model, applyTo) {
  const a = applyTo || { mode: 'none' };
  if (!MODES.includes(a.mode)) throw I.badRequest('Invalid apply_to mode');
  if (a.mode === 'none') return [];
  const params = [model.id];
  const where = [`i.model_id = $1`, `i.status = 'activa'`];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', '$' + params.length)); };
  if (a.mode === 'filter') {
    if (!a.manufacturer && !a.division && !a.asset_type) throw I.badRequest('Filter requires manufacturer, division or asset type');
    if (a.manufacturer) add('a.manufacturer ILIKE ?', a.manufacturer);
    if (a.division) add('i.branch_id::text = ?', String(a.division));
    if (a.asset_type) add('a.asset_type = ?', a.asset_type);
  }
  if (a.mode === 'list') {
    const ids = Array.isArray(a.instance_ids) ? [...new Set(a.instance_ids.map(String))] : [];
    if (!ids.length) throw I.badRequest('Select at least one instance');
    add('i.id::text = ANY(?)', ids);
  }
  const r = await db.query(`
    SELECT i.id, i.code, i.current_version_id, cv.version AS current_version,
           a.code AS asset_code, a.manufacturer, b.name AS branch_name,
           (SELECT iv.valid_from FROM instance_versions iv WHERE iv.instance_id = i.id AND iv.valid_to IS NULL) AS current_since
    FROM ai_instances i LEFT JOIN assets a ON a.id = i.asset_id JOIN branches b ON b.id = i.branch_id
    LEFT JOIN model_versions cv ON cv.id = i.current_version_id
    WHERE ${where.join(' AND ')} ORDER BY a.code NULLS LAST, i.code`, params);
  if (a.mode === 'list' && r.rows.length !== new Set(a.instance_ids.map(String)).size) {
    throw I.badRequest('Some instances are not active instances of this model');
  }
  return r.rows;
}

// Copia completa de la ficha de una instancia (antes del cambio)
async function instanceSnapshot(db, instanceId) {
  const inst = (await db.query('SELECT * FROM ai_instances WHERE id = $1', [instanceId])).rows[0];
  const sections = {};
  for (const [key, s] of Object.entries(I.INSTANCE_SECTIONS)) {
    sections[key] = (await db.query(`SELECT * FROM ${s.table} WHERE instance_id = $1`, [instanceId])).rows[0] || null;
  }
  const integrations = (await db.query('SELECT * FROM inst_integrations WHERE instance_id = $1', [instanceId])).rows;
  return { instance: inst, sections, integrations };
}

// Aplica una versión a las instancias elegidas (regla 2 del diseño)
async function applyVersion(db, user, version, targets, installedAt) {
  const skipped = targets.filter(t => String(t.current_version_id) === String(version.id))
    .map(t => ({ code: t.code, asset_code: t.asset_code, reason: 'already_on_version' }));
  const toApply = targets.filter(t => String(t.current_version_id) !== String(version.id));

  // La fecha no puede ser anterior al inicio de la versión vigente
  const tooEarly = toApply.filter(t => t.current_since && String(t.current_since) > installedAt);
  if (tooEarly.length) {
    throw { status: 400, message: 'Installation date is before the current version start',
            instances: tooEarly.map(t => ({ code: t.code, asset_code: t.asset_code, current_since: t.current_since })) };
  }

  const userId = I.asUuid(user.userId);
  for (const t of toApply) {
    await db.query(
      `INSERT INTO record_snapshots (entity_type, entity_id, version_id, reason, data, taken_by) VALUES ('instancia', $1, $2, $3, $4, $5)`,
      [t.id, t.current_version_id, `Antes de instalar la versión ${version.version}`, JSON.stringify(await instanceSnapshot(db, t.id)), userId]);
    await db.query(`UPDATE instance_versions SET valid_to = $2 WHERE instance_id = $1 AND valid_to IS NULL`, [t.id, installedAt]);
    await db.query(`INSERT INTO instance_versions (instance_id, version_id, valid_from, created_by) VALUES ($1, $2, $3, $4)`,
      [t.id, version.id, installedAt, userId]);
    await db.query(`UPDATE ai_instances SET current_version_id = $2, reclassification_pending = true, updated_at = NOW() WHERE id = $1`,
      [t.id, version.id]);
  }
  return {
    applied: toApply.map(t => ({ code: t.code, asset_code: t.asset_code, from: t.current_version, to: version.version })),
    skipped
  };
}

const preview = targets => ({
  dry_run: true,
  instances: targets.map(t => ({ id: t.id, code: t.code, asset_code: t.asset_code, manufacturer: t.manufacturer,
                                 branch_name: t.branch_name, current_version: t.current_version }))
});

async function register(pool, user, body) {
  assertCan(user, 'version.write');
  const v = body.version && String(body.version).trim();
  if (!v) throw I.badRequest('Version required');
  const released = body.released_at || I.today();
  I.assertDate(released, 'released_at');
  const installed = body.installed_at || released;
  I.assertDate(installed, 'installed_at');
  if (body.changes_unknown !== undefined && typeof body.changes_unknown !== 'boolean') throw I.badRequest('Invalid value: changes_unknown');

  return I.inTransaction(pool, async db => {
    const model = await loadModel(db, user, body.model_id);
    const targets = await selectInstances(db, model, body.apply_to);
    if (body.dry_run) return preview(targets);

    // Copia de la ficha del modelo antes de la nueva versión
    await db.query(
      `INSERT INTO record_snapshots (entity_type, entity_id, reason, data, taken_by) VALUES ('modelo', $1, $2, $3, $4)`,
      [model.id, `Antes de registrar la versión ${v}`, JSON.stringify(model), I.asUuid(user.userId)]);
    const r = await db.query(
      `INSERT INTO model_versions (model_id, version, released_at, change_notes, changes_unknown, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [model.id, v, released, body.change_notes || null, body.changes_unknown === true, I.asUuid(user.userId)]);
    const version = r.rows[0];
    const out = await applyVersion(db, user, version, targets, installed);
    return { version_id: version.id, version: version.version, ...out };
  });
}

async function applyMore(pool, user, versionId, body) {
  assertCan(user, 'version.write');
  return I.inTransaction(pool, async db => {
    const r = await db.query(
      `SELECT v.* FROM model_versions v JOIN ai_models m ON m.id = v.model_id WHERE v.id::text = $1 AND m.company_id = $2`,
      [String(versionId), user.companyId]);
    const version = r.rows[0];
    if (!version) throw { status: 404, message: 'Version not found' };
    const model = await loadModel(db, user, version.model_id);
    const installed = body.installed_at || I.today();
    I.assertDate(installed, 'installed_at');
    if (!body.apply_to || body.apply_to.mode === 'none') throw I.badRequest('Select where to apply the version');
    const targets = await selectInstances(db, model, body.apply_to);
    if (body.dry_run) return preview(targets);
    if (!targets.length) throw I.badRequest('No instances match');
    return { version_id: version.id, version: version.version, ...(await applyVersion(db, user, version, targets, installed)) };
  });
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  const pool = getClientPool(user.dbName);
  const { id, action } = req.query;
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (id && action === 'apply') return res.status(200).json(await applyMore(pool, user, id, req.body || {}));
    if (!id) {
      const out = await register(pool, user, req.body || {});
      return res.status(out.dry_run ? 200 : 201).json(out);
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    if (e && e.code === '23505') return res.status(409).json({ error: 'Version already exists for this model' });
    const err = I.dbError(e);
    if (err && err.status && err.instances) return res.status(err.status).json({ error: err.message, instances: err.instances });
    return sendError(res, err);
  }
};
