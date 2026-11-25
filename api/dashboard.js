// ============================================================
// Dashboard — /api/dashboard?division=
// Indicadores, mapa de riesgo, "requieren atención" e incidentes recientes,
// según la división efectiva del usuario.
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, sendError } = require('./_auth');
const I = require('./_inventory');
const { pending } = require('./pending');

async function dashboard(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const p = [user.companyId];
  if (division) p.push(division);
  const divI = division ? ' AND i.branch_id::text = $2' : '';
  const divA = division ? ' AND a.branch_id::text = $2' : '';
  const divX = division ? ' AND x.branch_id::text = $2' : '';
  const divB = division ? ' AND b.id::text = $2' : '';
  const one = async sql => (await db.query(sql, p)).rows[0];

  const [counts, riskMap, seriousOpen, recent, pend] = await Promise.all([
    one(`SELECT
      (SELECT count(*)::int FROM assets a WHERE a.company_id = $1 AND a.status = 'activo'${divA}) AS assets,
      (SELECT count(DISTINCT i.model_id)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${divI}) AS models,
      (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${divI}) AS installations,
      (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'
         AND i.risk_level IN ('Critical','High')${divI}) AS high_risk,
      (SELECT count(*)::int FROM ai_incidents x WHERE x.company_id = $1
         AND x.occurred_at >= CURRENT_DATE - INTERVAL '12 months'${divX}) AS incidents_12m`),
    db.query(`
      SELECT b.id, b.name,
        count(*) FILTER (WHERE i.risk_level = 'Critical')::int AS "Critical",
        count(*) FILTER (WHERE i.risk_level = 'High')::int AS "High",
        count(*) FILTER (WHERE i.risk_level = 'Medium')::int AS "Medium",
        count(*) FILTER (WHERE i.risk_level = 'Low')::int AS "Low",
        count(i.id)::int AS total
      FROM branches b LEFT JOIN ai_instances i ON i.branch_id = b.id AND i.status = 'activa'
      WHERE b.company_id = $1 AND b.status = 'active'${divB}
      GROUP BY b.id, b.name ORDER BY b.name`, p),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.severity, x.status, a.code AS asset_code
      FROM ai_incidents x JOIN assets a ON a.id = x.asset_id
      WHERE x.company_id = $1 AND x.severity IN ('grave','critico') AND x.status <> 'cerrado'${divX}
      ORDER BY x.occurred_at DESC LIMIT 10`, p),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.severity, x.status, x.kind, a.code AS asset_code, m.name AS model_name, v.version
      FROM ai_incidents x JOIN assets a ON a.id = x.asset_id
      LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id
      LEFT JOIN model_versions v ON v.id = x.version_id
      WHERE x.company_id = $1${divX} ORDER BY x.occurred_at DESC, x.created_at DESC LIMIT 5`, p),
    pending(db, user, q)
  ]);

  return {
    division,
    counts: { ...counts, pending: pend.counts.total },
    risk_map: riskMap.rows,
    attention: {
      serious_open_incidents: seriousOpen.rows,
      reclassification_pending: pend.items.reclassification_pending.slice(0, 5),
      reviews_overdue: pend.items.reviews_overdue.slice(0, 5),
      totals: {
        serious_open_incidents: seriousOpen.rows.length,
        reclassification_pending: pend.counts.reclassification_pending,
        reviews_overdue: pend.counts.reviews_overdue
      }
    },
    recent_incidents: recent.rows
  };
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    return res.status(200).json(await dashboard(getClientPool(user.dbName), user, req.query));
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};
