// ============================================================
// Catálogo de modelos — /api/models
//   GET    /api/models?division=&q=&vendor=&status=&catalog=   lista (catalog=1: todo el catálogo aunque no esté en la división)
//   GET    /api/models?id=&division=                  ficha (versiones, instalaciones, incidentes)
//   POST   /api/models                                crear { ...campos, field_status?, first_version? }
//   PUT    /api/models?id=                            editar { ...campos, field_status? }
//   DELETE /api/models?id=                            retirar (solo sin instancias activas)
// Diseño: docs/activos-y-modelos.md
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, pickKnownFields, sendError } = require('./_auth');
const I = require('./_inventory');

const BOOL_FIELDS = ['black_box', 'vendor_questionnaire_received', 'ce_marking_declared', 'annex_iv_complete'];
const DATE_FIELDS = ['vendor_questionnaire_sent_at', 'last_retrain_date', 'next_contract_renewal'];

function validateModel(f, creating) {
  for (const k of ['name', 'vendor']) {
    if (creating || k in f) {
      if (!f[k] || !String(f[k]).trim()) throw I.badRequest(`${k} required`);
      f[k] = String(f[k]).trim();
    }
  }
  I.assertOneOf(f.base_risk_level, I.RISK_LEVELS, 'base_risk_level');
  I.assertGroup(f.suggested_group, 'suggested_group');
  DATE_FIELDS.forEach(k => I.assertDate(f[k], k));
  BOOL_FIELDS.forEach(k => {
    if (k in f) {
      if (f[k] === null) f[k] = false;
      else if (typeof f[k] !== 'boolean') throw I.badRequest(`Invalid value: ${k}`);
    }
  });
}

async function loadModel(db, user, id) {
  const r = await db.query('SELECT * FROM ai_models WHERE id::text = $1 AND company_id = $2', [String(id), user.companyId]);
  if (!r.rows[0]) throw { status: 404, message: 'Model not found' };
  return r.rows[0];
}

async function list(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const params = [user.companyId];
  const where = ['m.company_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', '$' + params.length)); };
  add('m.status = ?', q.status === 'retirado' ? 'retirado' : 'activo');
  if (q.vendor) add('m.vendor ILIKE ?', q.vendor);
  if (q.q) add("(m.code || ' ' || m.name || ' ' || m.vendor) ILIKE ?", '%' + q.q + '%');
  // Instancias que cuentan: activas y, si hay división, de esa división
  let instCond = "i.model_id = m.id AND i.status = 'activa'";
  if (division) { params.push(division); instCond += ` AND i.branch_id::text = $${params.length}`; }
  // Con una división elegida, solo los modelos instalados en ella
  // (catalog=1: catálogo completo, para elegir qué instalar)
  if (division && q.catalog !== '1') where.push(`EXISTS (SELECT 1 FROM ai_instances i WHERE ${instCond})`);

  const r = await db.query(`
    SELECT m.id, m.code, m.name, m.vendor, m.suggested_group, m.base_risk_level, m.black_box, m.status,
           (SELECT count(*)::int FROM ai_instances i WHERE ${instCond}) AS instances_count,
           (SELECT coalesce(array_agg(DISTINCT v.version ORDER BY v.version), '{}')
              FROM ai_instances i JOIN model_versions v ON v.id = i.current_version_id WHERE ${instCond}) AS versions_in_use,
           (SELECT count(*)::int FROM ai_incidents x JOIN ai_instances i ON i.id = x.instance_id WHERE ${instCond.replace("AND i.status = 'activa'", '')}) AS incidents_count,
           (SELECT count(*)::int FROM ai_instances i WHERE ${instCond} AND i.reclassification_pending) AS reclassification_pending,
           (SELECT count(*)::int FROM jsonb_object_keys(m.field_status)) AS fields_flagged
    FROM ai_models m
    WHERE ${where.join(' AND ')}
    ORDER BY m.name`, params);
  return r.rows;
}

async function detail(db, user, id, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const model = await loadModel(db, user, id);
  const params = [model.id];
  let scope = '';
  if (division) { params.push(division); scope = ` AND i.branch_id::text = $2`; }

  const [versions, instances, incidents] = await Promise.all([
    db.query(`
      SELECT v.id, v.version, v.released_at, v.change_notes, v.changes_unknown,
             (SELECT count(*)::int FROM ai_instances i WHERE i.current_version_id = v.id AND i.status = 'activa'${scope}) AS instances_count
      FROM model_versions v WHERE v.model_id = $1 ORDER BY v.released_at DESC, v.created_at DESC`, params),
    db.query(`
      SELECT i.id, i.code, i.status, i.inventory_group, i.risk_level, i.reclassification_pending, i.installed_at,
             a.id AS asset_id, a.code AS asset_code, a.name AS asset_name, a.manufacturer,
             i.branch_id, b.name AS branch_name, v.version AS current_version
      FROM ai_instances i LEFT JOIN assets a ON a.id = i.asset_id JOIN branches b ON b.id = i.branch_id
      LEFT JOIN model_versions v ON v.id = i.current_version_id
      WHERE i.model_id = $1${scope} ORDER BY i.status, a.code NULLS LAST`, params),
    db.query(`
      SELECT v.version, count(x.id)::int AS incidents
      FROM ai_incidents x JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN model_versions v ON v.id = x.version_id
      WHERE i.model_id = $1${scope} GROUP BY v.version ORDER BY v.version`, params)
  ]);
  return { model, versions: versions.rows, instances: instances.rows, incidents_by_version: incidents.rows };
}

async function create(pool, user, body) {
  assertCan(user, 'model.write');
  const { field_status, first_version, ...rest } = body;
  const f = pickKnownFields(rest, I.MODEL_FIELDS);
  validateModel(f, true);
  const fs = I.mergeFieldStatus({}, field_status, I.MODEL_FIELDS) || {};

  return I.inTransaction(pool, async db => {
    const cols = ['company_id', 'field_status', ...Object.keys(f)];
    const vals = [user.companyId, JSON.stringify(fs), ...Object.values(f)];
    const r = await db.query(
      `INSERT INTO ai_models (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id, code`, vals);
    const model = r.rows[0];
    if (first_version && first_version.version) {
      I.assertDate(first_version.released_at, 'released_at');
      await db.query(
        `INSERT INTO model_versions (model_id, version, released_at, change_notes, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [model.id, String(first_version.version).trim(), first_version.released_at || I.today(), first_version.change_notes || null, I.asUuid(user.userId)]);
    }
    return model;
  });
}

async function update(pool, user, id, body) {
  assertCan(user, 'model.write');
  const { field_status, ...rest } = body;
  const f = pickKnownFields(rest, I.MODEL_FIELDS);
  validateModel(f, false);

  return I.inTransaction(pool, async db => {
    const model = await loadModel(db, user, id);
    if (model.status === 'retirado') throw I.badRequest('Model is retired');
    const fs = I.mergeFieldStatus(model.field_status, field_status, I.MODEL_FIELDS);
    if (fs !== undefined) f.field_status = JSON.stringify(fs);
    if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
    const keys = Object.keys(f);
    await db.query(
      `UPDATE ai_models SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [model.id, ...Object.values(f)]);
    // Si sube el riesgo base, ninguna instancia puede quedar por debajo
    let raised = 0;
    if (f.base_risk_level) {
      const r = await db.query(`
        UPDATE ai_instances SET risk_level = $2, updated_at = NOW()
        WHERE model_id = $1 AND status = 'activa' AND
              (risk_level IS NULL OR array_position(ARRAY['Low','Medium','High','Critical'], risk_level)
                                   < array_position(ARRAY['Low','Medium','High','Critical'], $2::text))`,
        [model.id, f.base_risk_level]);
      raised = r.rowCount;
    }
    return { success: true, instances_risk_raised: raised };
  });
}

async function retire(pool, user, id) {
  assertCan(user, 'model.write');
  return I.inTransaction(pool, async db => {
    const model = await loadModel(db, user, id);
    const r = await db.query(`SELECT count(*)::int AS n FROM ai_instances WHERE model_id = $1 AND status = 'activa'`, [model.id]);
    if (r.rows[0].n > 0) return Promise.reject({ status: 409, message: 'Model has active instances', count: r.rows[0].n });
    await db.query(`UPDATE ai_models SET status = 'retirado', updated_at = NOW() WHERE id = $1`, [model.id]);
    return { success: true };
  });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  const pool = getClientPool(user.dbName);
  const { id } = req.query;
  try {
    if (req.method === 'GET' && id) return res.status(200).json(await detail(pool, user, id, req.query));
    if (req.method === 'GET') return res.status(200).json(await list(pool, user, req.query));
    if (req.method === 'POST') return res.status(201).json(await create(pool, user, req.body || {}));
    if (req.method === 'PUT' && id) return res.status(200).json(await update(pool, user, id, req.body || {}));
    if (req.method === 'DELETE' && id) return res.status(200).json(await retire(pool, user, id));
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const err = I.dbError(e);
    if (err && err.status && err.count !== undefined) return res.status(err.status).json({ error: err.message, count: err.count });
    return sendError(res, err);
  }
};
