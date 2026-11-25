// ============================================================
// Pendientes — /api/pending?division=
// Tareas pendientes (con plazo o urgencia), con conteos. La información incompleta
// de modelos e instalaciones se muestra en Modelos de IA y en cada ficha.
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, sendError } = require('./_auth');
const I = require('./_inventory');

const LIMIT = 200;

async function pending(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const p = [user.companyId];
  // Filtro por división para instancias (alias i), activos (a) e incidentes (x)
  const divI = division ? (p.push(division), ` AND i.branch_id::text = $${p.length}`) : '';
  const divA = division ? ` AND a.branch_id::text = $2` : '';
  const divX = division ? ` AND x.branch_id::text = $2` : '';

  const q1 = (sql) => db.query(sql + ` LIMIT ${LIMIT}`, p).then(r => r.rows);
  const [assetsUnknown, noAsset, reclass, undetermined, overdue, actionsOverdue] = await Promise.all([
    q1(`
      SELECT a.id, a.code, a.name, a.ai_usage, b.name AS branch_name
      FROM assets a JOIN branches b ON b.id = a.branch_id
      WHERE a.company_id = $1 AND a.status = 'activo' AND a.ai_usage <> 'usa_ia'${divA} ORDER BY a.code`),
    q1(`
      SELECT i.id, i.code, m.name AS model_name, b.name AS branch_name
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id JOIN branches b ON b.id = i.branch_id
      WHERE i.company_id = $1 AND i.status = 'activa' AND i.asset_id IS NULL${divI} ORDER BY i.code`),
    q1(`
      SELECT i.id, i.code, m.name AS model_name, a.code AS asset_code, v.version
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id LEFT JOIN assets a ON a.id = i.asset_id
      LEFT JOIN model_versions v ON v.id = i.current_version_id
      WHERE i.company_id = $1 AND i.status = 'activa' AND i.reclassification_pending${divI} ORDER BY a.code NULLS LAST, m.name`),
    q1(`
      SELECT x.id, x.occurred_at, x.title, a.code AS asset_code
      FROM ai_incidents x JOIN assets a ON a.id = x.asset_id
      WHERE x.company_id = $1 AND x.instance_id IS NULL${divX} ORDER BY x.occurred_at DESC`),
    q1(`
      SELECT i.id, i.code, m.name AS model_name, a.code AS asset_code, i.next_review_date
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id LEFT JOIN assets a ON a.id = i.asset_id
      WHERE i.company_id = $1 AND i.status = 'activa' AND i.next_review_date < CURRENT_DATE${divI} ORDER BY i.next_review_date`),
    // Acciones correctivas vencidas de incidentes abiertos (ISO 42001 10.2)
    q1(`
      SELECT ac.id AS action_id, ac.action, ac.owner, ac.due_date, x.id, x.title, a.code AS asset_code
      FROM incident_actions ac JOIN ai_incidents x ON x.id = ac.incident_id JOIN assets a ON a.id = x.asset_id
      WHERE x.company_id = $1 AND x.status = 'abierto' AND ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE${divX}
      ORDER BY ac.due_date`)
  ]);

  // Solo tareas, de la más urgente a la menos urgente (la información incompleta se ve en Modelos de IA)
  const items = {
    incident_actions_overdue: actionsOverdue,
    incidents_model_undetermined: undetermined,
    reclassification_pending: reclass,
    reviews_overdue: overdue,
    assets_models_unknown: assetsUnknown,
    instances_without_asset: noAsset
  };
  const counts = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length]));
  counts.total = Object.values(counts).reduce((s, n) => s + n, 0);
  return { division, counts, items };
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    return res.status(200).json(await pending(getClientPool(user.dbName), user, req.query));
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};

// Reutilizada por api/dashboard.js
module.exports.pending = pending;
