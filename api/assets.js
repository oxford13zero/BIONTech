// ============================================================
// Activos — /api/assets
//   GET    /api/assets?division=&type=&manufacturer=&area=&status=&q=   lista
//   GET    /api/assets?id=                                              detalle
//   GET    /api/assets?id=&compare=1&from=&to=                          comparación antes / después
//   POST   /api/assets                                                  crear (con sus modelos)
//   PUT    /api/assets?id=                                              editar
//   DELETE /api/assets?id=&date=                                        retirar
// Diseño: docs/activos-y-modelos.md
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, pickKnownFields, sendError } = require('./_auth');
const I = require('./_inventory');

// Activo visible para el usuario (empresa y división efectiva)
async function loadAsset(db, user, id) {
  const r = await db.query(
    `SELECT a.*, b.name AS branch_name FROM assets a JOIN branches b ON b.id = a.branch_id
     WHERE a.id::text = $1 AND a.company_id = $2`, [String(id), user.companyId]);
  const a = r.rows[0];
  if (!a) throw { status: 404, message: 'Asset not found' };
  const scope = assertCan(user, 'inventory.view');
  if (scope === 'division' && String(a.branch_id) !== String(user.divisionId)) throw { status: 404, message: 'Asset not found' };
  return a;
}

async function list(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const params = [user.companyId];
  const where = ['a.company_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', '$' + params.length)); };
  if (division) add('a.branch_id::text = ?', division);
  add('a.status = ?', q.status === 'retirado' ? 'retirado' : 'activo');
  if (q.type) add('a.asset_type = ?', q.type);
  if (q.manufacturer) add('a.manufacturer ILIKE ?', q.manufacturer);
  if (q.area) add('a.area ILIKE ?', q.area);
  if (q.q) add("(a.code || ' ' || a.name || ' ' || coalesce(a.manufacturer, '')) ILIKE ?", '%' + q.q + '%');

  const r = await db.query(`
    SELECT a.id, a.code, a.name, a.asset_type, a.manufacturer, a.equipment_model, a.area, a.ai_usage, a.status,
           a.branch_id, b.name AS branch_name,
           (SELECT count(*)::int FROM ai_instances i WHERE i.asset_id = a.id AND i.status = 'activa') AS models_count,
           (SELECT count(*)::int FROM ai_incidents x WHERE x.asset_id = a.id) AS incidents_count,
           (a.ai_usage <> 'usa_ia'
             OR EXISTS (SELECT 1 FROM ai_instances i WHERE i.asset_id = a.id AND i.status = 'activa' AND i.reclassification_pending)
             OR EXISTS (SELECT 1 FROM ai_incidents x WHERE x.asset_id = a.id AND x.instance_id IS NULL)) AS has_pending
    FROM assets a JOIN branches b ON b.id = a.branch_id
    WHERE ${where.join(' AND ')}
    ORDER BY a.code`, params);
  return r.rows;
}

async function detail(db, user, id) {
  const asset = await loadAsset(db, user, id);
  const [inst, inc] = await Promise.all([
    db.query(`
      SELECT i.id, i.code, i.status, i.inventory_group, i.risk_level, i.reclassification_pending, i.installed_at, i.retired_at,
             m.id AS model_id, m.code AS model_code, m.name AS model_name, m.vendor, m.black_box,
             v.version AS current_version, v.released_at AS version_date,
             (SELECT iv.valid_from FROM instance_versions iv WHERE iv.instance_id = i.id AND iv.valid_to IS NULL) AS current_since
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id
      LEFT JOIN model_versions v ON v.id = i.current_version_id
      WHERE i.asset_id = $1 ORDER BY i.status, m.name`, [asset.id]),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.kind, x.severity, x.status, x.eu_serious_incident,
             x.instance_id, i.code AS instance_code, m.name AS model_name, v.version
      FROM ai_incidents x LEFT JOIN ai_instances i ON i.id = x.instance_id
      LEFT JOIN ai_models m ON m.id = i.model_id LEFT JOIN model_versions v ON v.id = x.version_id
      WHERE x.asset_id = $1 ORDER BY x.occurred_at DESC`, [asset.id])
  ]);
  return { asset, instances: inst.rows, incidents: inc.rows };
}

// Comparación "antes y después" de un activo entre dos fechas.
// Por cada modelo: versión en cada fecha, si cambió, días de operación e incidentes de esa versión,
// y tasa de incidentes por cada 1.000 días (para comparar períodos de distinto largo).
async function compare(db, user, id, from, to) {
  if (!from || !to) throw I.badRequest('Two dates required');
  I.assertDate(from, 'from'); I.assertDate(to, 'to');
  if (from >= to) throw I.badRequest('The first date must be before the second');
  const asset = await loadAsset(db, user, id);
  const r = await db.query(`
    SELECT i.id AS instance_id, i.code AS instance_code, i.status, m.name AS model_name, m.vendor, m.black_box,
           iv.valid_from, iv.valid_to, v.version, v.changes_unknown,
           (LEAST(coalesce(iv.valid_to, CURRENT_DATE), CURRENT_DATE) - iv.valid_from) AS days,
           (SELECT count(*)::int FROM ai_incidents x WHERE x.instance_id = i.id
              AND x.occurred_at >= iv.valid_from AND (iv.valid_to IS NULL OR x.occurred_at < iv.valid_to)) AS incidents
    FROM ai_instances i JOIN ai_models m ON m.id = i.model_id
    JOIN instance_versions iv ON iv.instance_id = i.id JOIN model_versions v ON v.id = iv.version_id
    WHERE i.asset_id = $1 ORDER BY m.name, iv.valid_from`, [asset.id]);

  const period = row => row && {
    version: row.version, from: row.valid_from, to: row.valid_to, days: row.days, incidents: row.incidents,
    changes_unknown: row.changes_unknown,
    rate_per_1000_days: row.days > 0 ? Math.round(row.incidents / row.days * 1000 * 100) / 100 : null
  };
  const at = (rows, d) => rows.find(x => String(x.valid_from) <= d && (!x.valid_to || String(x.valid_to) > d));

  const byInstance = {};
  for (const row of r.rows) (byInstance[row.instance_id] = byInstance[row.instance_id] || []).push(row);
  const models = Object.values(byInstance).map(rows => {
    const a = at(rows, from), b = at(rows, to);
    return {
      instance_id: rows[0].instance_id, instance_code: rows[0].instance_code, model_name: rows[0].model_name,
      vendor: rows[0].vendor, black_box: rows[0].black_box, status: rows[0].status,
      changed: !!(a && b && a.version !== b.version),
      before: period(a), after: period(b)
    };
  });
  return { asset: { id: asset.id, code: asset.code, name: asset.name }, from, to, models };
}

function validateAsset(f, creating) {
  if (creating || 'code' in f) { if (!f.code || !String(f.code).trim()) throw I.badRequest('Code required'); f.code = String(f.code).trim(); }
  if (creating || 'name' in f) { if (!f.name || !String(f.name).trim()) throw I.badRequest('Name required'); f.name = String(f.name).trim(); }
  if (creating || 'asset_type' in f) I.assertOneOf(f.asset_type ?? 'x', I.ASSET_TYPES, 'asset_type');
  if ('ai_usage' in f) I.assertOneOf(f.ai_usage ?? 'x', I.AI_USAGE, 'ai_usage');
  I.assertDate(f.commissioned_at, 'commissioned_at');
}

async function create(pool, user, body) {
  assertCan(user, 'asset.write');
  const f = pickKnownFields(body.asset, I.ASSET_FIELDS);
  validateAsset(f, true);
  f.ai_usage = f.ai_usage || 'usa_ia';
  const models = Array.isArray(body.models) ? body.models : [];
  const newModels = Array.isArray(body.new_models) ? body.new_models : [];
  if (f.ai_usage === 'usa_ia' && !models.length && !newModels.length) {
    throw I.badRequest('Select at least one model, or mark the asset as "models to identify"');
  }

  return I.inTransaction(pool, async db => {
    await I.assertBranch(db, user.companyId, f.branch_id);
    const cols = ['company_id', ...Object.keys(f)];
    const vals = [user.companyId, ...Object.values(f)];
    const r = await db.query(
      `INSERT INTO assets (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id, code`, vals);
    const asset = r.rows[0];

    const instances = [];
    const seen = new Set();
    for (const m of models) {
      if (seen.has(String(m.model_id))) throw I.badRequest('Model selected twice');
      seen.add(String(m.model_id));
      instances.push(await I.createInstance(db, {
        companyId: user.companyId, modelId: m.model_id, assetId: asset.id, branchId: f.branch_id,
        installedAt: m.installed_at || f.commissioned_at, group: m.inventory_group, userId: user.userId
      }));
    }
    for (const n of newModels) {
      const model = await I.createShortModel(db, {
        companyId: user.companyId, name: n.name, vendor: n.vendor, version: n.version, releasedAt: n.released_at,
        baseRisk: n.base_risk_level, suggestedGroup: n.suggested_group, userId: user.userId
      });
      instances.push(await I.createInstance(db, {
        companyId: user.companyId, modelId: model.id, assetId: asset.id, branchId: f.branch_id,
        installedAt: n.installed_at || f.commissioned_at, group: n.inventory_group ?? n.suggested_group, userId: user.userId
      }));
    }
    return { id: asset.id, code: asset.code, instances };
  });
}

async function update(pool, user, id, body) {
  assertCan(user, 'asset.write');
  const f = pickKnownFields(body, I.ASSET_FIELDS);
  if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
  validateAsset(f, false);

  return I.inTransaction(pool, async db => {
    const asset = await loadAsset(db, user, id);
    if (asset.status === 'retirado') throw I.badRequest('Asset is retired');
    if ('branch_id' in f) await I.assertBranch(db, user.companyId, f.branch_id);
    const keys = Object.keys(f);
    await db.query(
      `UPDATE assets SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [asset.id, ...Object.values(f)]);
    // Si cambia de división, sus instancias e incidentes se mueven con él
    if ('branch_id' in f && String(f.branch_id) !== String(asset.branch_id)) {
      await db.query('UPDATE ai_instances SET branch_id = $2, updated_at = NOW() WHERE asset_id = $1', [asset.id, f.branch_id]);
      await db.query('UPDATE ai_incidents SET branch_id = $2, updated_at = NOW() WHERE asset_id = $1', [asset.id, f.branch_id]);
    }
    return { success: true };
  });
}

async function retire(pool, user, id, date) {
  assertCan(user, 'asset.write');
  const when = date || I.today();
  I.assertDate(when, 'date');
  return I.inTransaction(pool, async db => {
    const asset = await loadAsset(db, user, id);
    if (asset.status === 'retirado') throw I.badRequest('Asset already retired');
    await db.query(`UPDATE assets SET status = 'retirado', retired_at = $2, updated_at = NOW() WHERE id = $1`, [asset.id, when]);
    const inst = await db.query(
      `UPDATE ai_instances SET status = 'retirada', retired_at = $2, updated_at = NOW()
       WHERE asset_id = $1 AND status = 'activa' RETURNING id`, [asset.id, when]);
    // Cerrar la versión vigente de cada instancia en la fecha de retiro
    await db.query(
      `UPDATE instance_versions SET valid_to = GREATEST($2::date, valid_from)
       WHERE valid_to IS NULL AND instance_id = ANY($1::uuid[])`, [inst.rows.map(r => r.id), when]);
    return { success: true, retired_instances: inst.rowCount };
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
    if (req.method === 'GET' && id && req.query.compare) return res.status(200).json(await compare(pool, user, id, req.query.from, req.query.to));
    if (req.method === 'GET' && id) return res.status(200).json(await detail(pool, user, id));
    if (req.method === 'GET') return res.status(200).json(await list(pool, user, req.query));
    if (req.method === 'POST') return res.status(201).json(await create(pool, user, req.body || {}));
    if (req.method === 'PUT' && id) return res.status(200).json(await update(pool, user, id, req.body || {}));
    if (req.method === 'DELETE' && id) return res.status(200).json(await retire(pool, user, id, req.query.date));
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};
