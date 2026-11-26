// ============================================================
// Dashboard — /api/dashboard?division=&period=30d|90d|12m
// Indicadores, mapa de riesgo, "requieren atención", incidentes recientes,
// tendencia, incidentes por modelo y salud de la gobernanza, según la división
// efectiva del usuario. Ver docs/dashboard.md.
//   GET ?legislation=1   normas de IA (BD maestra): primero las del país de la empresa
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, sendError } = require('./_auth');
const I = require('./_inventory');
const { pending } = require('./pending');
const { parts } = require('./reports');
const { getMasterPool } = require('./_helpers');

const PERIODS = { '30d': { days: 30, unit: 'week' }, '90d': { days: 90, unit: 'week' }, '12m': { months: 12, unit: 'month' } };
const iso = d => d.toISOString().slice(0, 10);

// Período elegido y el anterior de igual largo (para comparar)
function periodOf(key, today = new Date()) {
  const def = PERIODS[key || '12m'];
  if (!def) throw I.badRequest('Invalid period');
  const to = new Date(iso(today) + 'T00:00:00Z'), from = new Date(to), prevTo = new Date(to);
  if (def.months) { from.setUTCMonth(from.getUTCMonth() - def.months); } else { from.setUTCDate(from.getUTCDate() - def.days); }
  from.setUTCDate(from.getUTCDate() + 1);
  prevTo.setTime(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo);
  if (def.months) { prevFrom.setUTCMonth(prevFrom.getUTCMonth() - def.months); } else { prevFrom.setUTCDate(prevFrom.getUTCDate() - def.days); }
  prevFrom.setUTCDate(prevFrom.getUTCDate() + 1);
  return { key: key || '12m', unit: def.unit, from: iso(from), to: iso(to), prev_from: iso(prevFrom), prev_to: iso(prevTo) };
}

async function dashboard(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const per = periodOf(q.period);
  const p = [user.companyId];
  if (division) p.push(division);
  const divI = division ? ' AND i.branch_id::text = $2' : '';
  const divA = division ? ' AND a.branch_id::text = $2' : '';
  const divX = division ? ' AND x.branch_id::text = $2' : '';
  const divB = division ? ' AND b.id::text = $2' : '';
  const one = async sql => (await db.query(sql, p)).rows[0];

  const [counts, riskMap, seriousOpen, recent, pend, charts] = await Promise.all([
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
      WHERE x.company_id = $1 AND x.severity IN ('incidente_grave','desastre') AND x.status = 'abierto'${divX}
      ORDER BY x.occurred_at DESC LIMIT 10`, p),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.severity, x.status, x.kind, a.code AS asset_code, m.name AS model_name, v.version
      FROM ai_incidents x JOIN assets a ON a.id = x.asset_id
      LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id
      LEFT JOIN model_versions v ON v.id = x.version_id
      WHERE x.company_id = $1${divX} ORDER BY x.occurred_at DESC, x.created_at DESC LIMIT 5`, p),
    pending(db, user, q),
    dashboardCharts(db, user, division, per)
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
    recent_incidents: recent.rows,
    period: per,
    ...charts
  };
}

// Indicadores del período (con el anterior), tendencia, incidentes por modelo y salud de la gobernanza
async function dashboardCharts(db, user, division, per) {
  const p = [user.companyId, per.from, per.to, per.prev_from, per.prev_to];
  if (division) p.push(division);
  const divX = division ? ` AND x.branch_id::text = $${p.length}` : '';
  const SER = `x.severity IN ('incidente_grave','desastre')`;
  // Tendencia: semanas (30 y 90 días) o meses (12 meses)
  const tp = [user.companyId, per.from, per.to, per.unit];
  if (division) tp.push(division);
  const tDiv = division ? ` AND x.branch_id::text = $5` : '';
  // Misma cobertura que los informes: null = toda la empresa
  const P = { coverage: division ? [{ id: division }] : null, filters: { from: per.from, to: per.to } };
  const [kpi, trend, byModel, actions, changes, gaps, inst] = await Promise.all([
    db.query(`SELECT
        count(*) FILTER (WHERE x.occurred_at BETWEEN $2 AND $3)::int AS incidents,
        count(*) FILTER (WHERE x.occurred_at BETWEEN $4 AND $5)::int AS incidents_prev,
        count(*) FILTER (WHERE x.occurred_at BETWEEN $2 AND $3 AND ${SER})::int AS serious,
        count(*) FILTER (WHERE x.occurred_at BETWEEN $4 AND $5 AND ${SER})::int AS serious_prev
      FROM ai_incidents x WHERE x.company_id = $1${divX}`, p),
    db.query(`SELECT to_char(b, 'YYYY-MM-DD') AS start, count(x.id)::int AS incidents,
        count(x.id) FILTER (WHERE ${SER})::int AS serious
      FROM generate_series(date_trunc($4::text, $2::date), date_trunc($4::text, $3::date), ('1 ' || $4::text)::interval) b
      LEFT JOIN ai_incidents x ON x.company_id = $1 AND date_trunc($4::text, x.occurred_at) = b
        AND x.occurred_at BETWEEN $2 AND $3${tDiv}
      GROUP BY b ORDER BY b`, tp),
    db.query(`SELECT m.name AS model, count(*)::int AS incidents
      FROM ai_incidents x LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id
      WHERE x.company_id = $1 AND x.occurred_at BETWEEN $2 AND $3${division ? ' AND x.branch_id::text = $4' : ''}
      GROUP BY m.name ORDER BY count(*) DESC, m.name NULLS LAST LIMIT 5`, [user.companyId, per.from, per.to, ...(division ? [division] : [])]),
    parts.actionsReport(db, user, P),
    parts.changesPreview(db, user, P),
    parts.gapsData(db, user, P),
    db.query(`SELECT count(*)::int AS n FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${division ? ' AND i.branch_id::text = $2' : ''}`,
      division ? [user.companyId, division] : [user.companyId])
  ]);
  const a = actions.summary, total = inst.rows[0].n;
  return {
    kpis: kpi.rows[0],
    trend: { unit: per.unit, points: trend.rows },
    by_model: byModel.rows,
    health: {
      actions_done: a.done, actions_on_time: a.done_on_time,
      changes: changes.changes, changes_reviewed: changes.reviewed,
      installations: total, installations_complete: total - Math.min(total, gaps.inst.length)
    }
  };
}

// Normas de IA (BD maestra): primero las del país de la empresa, luego el resto del mundo
async function legislation(user) {
  assertCan(user, 'inventory.view');
  const country = user.country || 'Chile';
  try {
    const r = await getMasterPool().query(`
      SELECT id, country, title, description, url, status, key_date::text AS key_date, applies_to, published_at
      FROM legislation_alerts WHERE active = true
      ORDER BY (country = $1) DESC, (status = 'plazo') DESC, published_at DESC LIMIT 20`, [country]);
    return { country, items: r.rows };
  } catch (e) {
    // Sin la migración 006 (columnas nuevas) o sin la tabla: el Dashboard sigue funcionando
    if (['42703', '42P01'].includes(e.code)) return { country, items: [] };
    throw e;
  }
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (req.query.legislation) return res.status(200).json(await legislation(user));
    return res.status(200).json(await dashboard(getClientPool(user.dbName), user, req.query));
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};

module.exports.periodOf = periodOf;
