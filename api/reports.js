// ============================================================
// Informes de gobernanza — /api/reports
// Ver docs/informes.md (catálogo, niveles y cobertura por rol).
//
//   GET ?action=catalog                    informes y si el rol puede generarlos
//   GET ?action=options                    divisiones que el usuario puede elegir
//   GET ?action=preview&report=4&...       conteos de lo que incluirá
//   GET ?action=generate&report=4&...      informe completo (encabezado + secciones)
//
// Parámetros de cobertura y filtros:
//   divisions = all | id1,id2      (roles de división: siempre la propia)
//   period    = 1m | 3m | year | custom (con from y to, AAAA-MM-DD)
//   status    = all | abierto | cerrado
//   severity  = all | graves
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, sendError } = require('./_auth');
const I = require('./_inventory');

function bad(status, message) { return { status, message }; }

// ── Catálogo ──────────────────────────────────────────────────
// level: company = consolidado (solo Super empresa) · division · system (un incidente)
// filters: qué filtros aplican a cada informe
// ready: ya se puede generar (los demás llegan en etapas siguientes)
const REPORTS = {
  1: { level: 'company',  frameworks: ['ISO 42001 9.3', 'NIST Govern'], filters: ['period'] },
  2: { level: 'company',  frameworks: ['ISO 42001 6.1', 'NIST Map/Measure'], filters: [] },
  3: { level: 'division', frameworks: ['ISO 42001 A.4', 'EU AI Act art. 49', 'NIST Map'], filters: [] },
  4: { level: 'division', frameworks: ['ISO 42001 10.2', 'ISO 45001', 'OECD'], filters: ['period', 'status', 'severity'], ready: true },
  5: { level: 'division', frameworks: ['ISO 42001 10.2', 'ISO 45001 10.2'], filters: ['period', 'status'] },
  6: { level: 'division', frameworks: ['ISO 42001 8.1', 'ISO 45001 MOC', 'NIST Manage'], filters: ['period'] },
  7: { level: 'division', frameworks: ['ISO 42001 A.6/A.10', 'EU AI Act art. 11/13'], filters: [] },
  8: { level: 'system',   frameworks: ['EU AI Act art. 73', 'CSET', 'OECD'], filters: [] }
};

const PERIODS = ['1m', '3m', 'year', 'custom'];
const STATUSES = ['all', 'abierto', 'cerrado'];
const SEVERITIES = ['all', 'graves'];
const SERIOUS = ['incidente_grave', 'desastre'];
const SEV_RANK = { incidente: 1, incidente_grave: 2, desastre: 3 };
const DETAIL_LIMIT = 1000;

// Puede generar este informe: los de empresa solo Super empresa
function allowed(user, id) {
  const scope = assertCan(user, 'report.generate');
  return REPORTS[id].level !== 'company' || scope === 'company';
}

function catalog(user) {
  assertCan(user, 'report.generate');
  return {
    reports: Object.entries(REPORTS).map(([id, r]) => ({
      id: Number(id), level: r.level, frameworks: r.frameworks, filters: r.filters,
      allowed: allowed(user, id), ready: !!r.ready
    }))
  };
}

// Divisiones que el usuario puede elegir (roles de división: solo la suya, fija)
async function divisionsFor(db, user) {
  const scope = assertCan(user, 'report.generate');
  const p = [user.companyId];
  let sql = `SELECT id, name FROM branches WHERE company_id = $1 AND status = 'active'`;
  if (scope === 'division') { p.push(String(user.divisionId)); sql += ' AND id::text = $2'; }
  const rows = (await db.query(sql + ' ORDER BY name', p)).rows;
  return { fixed: scope === 'division', divisions: rows };
}

// ── Validación de cobertura y filtros ─────────────────────────
const isoDate = d => d.toISOString().slice(0, 10);
function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && isoDate(d) === s;
}

function resolvePeriod(q, today = new Date()) {
  const period = q.period || '3m';
  if (!PERIODS.includes(period)) throw bad(400, 'Invalid period');
  const to = isoDate(today);
  if (period === 'custom') {
    if (!validDate(q.from) || !validDate(q.to)) throw bad(400, 'Invalid dates');
    if (q.from > q.to) throw bad(400, 'From date is after To date');
    if (q.to > to) throw bad(400, 'To date cannot be in the future');
    return { period, from: q.from, to: q.to };
  }
  const d = new Date(to + 'T00:00:00Z');
  if (period === '1m') d.setUTCMonth(d.getUTCMonth() - 1);
  if (period === '3m') d.setUTCMonth(d.getUTCMonth() - 3);
  if (period === 'year') d.setUTCMonth(0, 1);
  return { period, from: isoDate(d), to };
}

// Divisiones efectivas: null = toda la empresa; si no, lista de { id, name }
async function resolveCoverage(db, user, def, raw) {
  const scope = assertCan(user, 'report.generate');
  const requested = raw === undefined || raw === '' || raw === 'all'
    ? 'all' : String(raw).split(',').map(s => s.trim()).filter(Boolean);
  if (def.level === 'company') {
    if (scope !== 'company') throw bad(403, 'Only company super users can generate this report');
    if (requested !== 'all') throw bad(400, 'This report always covers the whole company');
    return null;
  }
  if (scope === 'division') {
    // Roles de división: siempre la propia; pedir otra es 403
    if (requested !== 'all' && (requested.length !== 1 || requested[0] !== String(user.divisionId))) {
      throw bad(403, 'Division outside your access');
    }
    const r = await db.query('SELECT id, name FROM branches WHERE id::text = $1 AND company_id = $2', [String(user.divisionId), user.companyId]);
    if (!r.rows[0]) throw bad(404, 'Division not found');
    return r.rows;
  }
  if (requested === 'all') return null;
  if (requested.length > 100 || new Set(requested).size !== requested.length) throw bad(400, 'Invalid divisions');
  const r = await db.query('SELECT id, name FROM branches WHERE id::text = ANY($1::text[]) AND company_id = $2 ORDER BY name', [requested, user.companyId]);
  if (r.rows.length !== requested.length) throw bad(404, 'Division not found');
  return r.rows;
}

async function resolveParams(db, user, q) {
  const id = String(q.report || '');
  const def = REPORTS[id];
  if (!def) throw bad(400, 'Unknown report');
  if (!allowed(user, id)) throw bad(403, 'Only company super users can generate this report');
  if (def.level === 'system') throw bad(400, 'This report is generated from the incident record');
  const coverage = await resolveCoverage(db, user, def, q.divisions);
  const f = {};
  if (def.filters.includes('period')) Object.assign(f, resolvePeriod(q));
  if (def.filters.includes('status')) {
    f.status = q.status || 'all';
    if (!STATUSES.includes(f.status)) throw bad(400, 'Invalid status');
  }
  if (def.filters.includes('severity')) {
    f.severity = q.severity || 'all';
    if (!SEVERITIES.includes(f.severity)) throw bad(400, 'Invalid severity');
  }
  return { id: Number(id), def, coverage, filters: f };
}

// Encabezado de trazabilidad (ISO 42001 7.5): qué, de quién, cuándo, quién
function meta(user, P) {
  return {
    report: P.id, level: P.def.level, frameworks: P.def.frameworks,
    company: user.companyName || null,
    coverage: P.coverage ? { all: false, divisions: P.coverage.map(b => b.name) } : { all: true, divisions: [] },
    filters: P.filters,
    generated_at: new Date().toISOString(),
    generated_by: { email: user.email || null, role: user.role }
  };
}

// ── Informe 4: Incidentes del período ─────────────────────────
// Filtro común de incidentes: empresa, divisiones, período, estado y gravedad
function incidentWhere(user, P) {
  const p = [user.companyId];
  let w = 'x.company_id = $1';
  if (P.coverage) { p.push(P.coverage.map(b => String(b.id))); w += ` AND x.branch_id::text = ANY($${p.length}::text[])`; }
  const f = P.filters;
  if (f.from) { p.push(f.from, f.to); w += ` AND x.occurred_at BETWEEN $${p.length - 1} AND $${p.length}`; }
  if (f.status && f.status !== 'all') { p.push(f.status); w += ` AND x.status = $${p.length}`; }
  if (f.severity === 'graves') { p.push(SERIOUS); w += ` AND x.severity = ANY($${p.length}::text[])`; }
  return { w, p };
}

async function incidentsPreview(db, user, P) {
  const { w, p } = incidentWhere(user, P);
  const r = await db.query(`
    SELECT count(*)::int AS incidents,
      count(*) FILTER (WHERE x.severity = ANY('{incidente_grave,desastre}'))::int AS serious,
      count(*) FILTER (WHERE x.status = 'abierto')::int AS open,
      (SELECT count(*)::int FROM incident_actions ac WHERE ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE
         AND ac.incident_id IN (SELECT x.id FROM ai_incidents x WHERE ${w})) AS actions_overdue
    FROM ai_incidents x WHERE ${w}`, p);
  return r.rows[0];
}

async function incidentsReport(db, user, P) {
  const { w, p } = incidentWhere(user, P);
  const base = `FROM ai_incidents x JOIN branches b ON b.id = x.branch_id JOIN assets a ON a.id = x.asset_id
    LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id WHERE ${w}`;
  const [summary, byDivision, byModel, bySeverity, detail] = await Promise.all([
    db.query(`
      SELECT count(*)::int AS incidents,
        count(*) FILTER (WHERE x.severity = ANY('{incidente_grave,desastre}'))::int AS serious,
        count(*) FILTER (WHERE x.status = 'abierto')::int AS open,
        count(*) FILTER (WHERE x.kind = 'peligro')::int AS hazards,
        count(*) FILTER (WHERE x.instance_id IS NULL)::int AS model_undetermined,
        round(avg(x.closed_at::date - x.occurred_at) FILTER (WHERE x.status = 'cerrado' AND x.closed_at IS NOT NULL), 1)::float AS avg_close_days,
        (SELECT count(*)::int FROM incident_actions ac WHERE ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE
           AND ac.incident_id IN (SELECT x.id FROM ai_incidents x WHERE ${w})) AS actions_overdue
      FROM ai_incidents x WHERE ${w}`, p),
    db.query(`
      SELECT b.name AS division, count(*)::int AS incidents,
        count(*) FILTER (WHERE x.severity = ANY('{incidente_grave,desastre}'))::int AS serious,
        count(*) FILTER (WHERE x.status = 'abierto')::int AS open,
        count(*) FILTER (WHERE x.instance_id IS NULL)::int AS model_undetermined
      ${base} GROUP BY b.name ORDER BY count(*) DESC, b.name`, p),
    db.query(`
      SELECT m.name AS model, count(*)::int AS incidents,
        mode() WITHIN GROUP (ORDER BY x.ai_behavior) AS main_behavior,
        max(CASE x.severity WHEN 'desastre' THEN 3 WHEN 'incidente_grave' THEN 2 ELSE 1 END)::int AS max_rank
      ${base} GROUP BY m.name ORDER BY count(*) DESC, m.name NULLS LAST`, p),
    db.query(`SELECT x.severity, count(*)::int AS incidents ${base} GROUP BY x.severity`, p),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.kind, x.severity, x.status, x.ai_behavior,
        a.code AS asset_code, m.name AS model, b.name AS division
      ${base} ORDER BY x.occurred_at DESC, x.created_at DESC LIMIT ${DETAIL_LIMIT + 1}`, p)
  ]);
  const rank = Object.fromEntries(Object.entries(SEV_RANK).map(([k, v]) => [v, k]));
  const sev = Object.fromEntries(bySeverity.rows.map(r => [r.severity, r.incidents]));
  return {
    summary: summary.rows[0],
    by_severity: Object.keys(SEV_RANK).map(s => ({ severity: s, incidents: sev[s] || 0 })),
    by_division: byDivision.rows,
    by_model: byModel.rows.map(({ max_rank, ...r }) => ({ ...r, max_severity: rank[max_rank] })),
    detail: detail.rows.slice(0, DETAIL_LIMIT),
    detail_truncated: detail.rows.length > DETAIL_LIMIT
  };
}

// Generadores por informe (los demás se agregan en las etapas siguientes)
const BUILDERS = {
  4: { preview: incidentsPreview, generate: incidentsReport }
};

async function run(db, user, q, kind) {
  const P = await resolveParams(db, user, q);
  const b = BUILDERS[P.id];
  if (!b) throw bad(501, 'Report not available yet');
  const data = await b[kind](db, user, P);
  return kind === 'preview' ? { report: P.id, filters: P.filters, counts: data } : { meta: meta(user, P), data };
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const db = getClientPool(user.dbName);
    const q = req.query || {};
    switch (q.action) {
      case 'catalog':  return res.status(200).json(catalog(user));
      case 'options':  return res.status(200).json(await divisionsFor(db, user));
      case 'preview':  return res.status(200).json(await run(db, user, q, 'preview'));
      case 'generate': return res.status(200).json(await run(db, user, q, 'generate'));
      default:         return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};

module.exports.REPORTS = REPORTS;
module.exports.resolvePeriod = resolvePeriod;
