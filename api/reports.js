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
const { pending } = require('./pending');

function bad(status, message) { return { status, message }; }

// ── Catálogo ──────────────────────────────────────────────────
// level: company = consolidado (solo Super empresa) · division · system (un incidente)
// filters: qué filtros aplican a cada informe
// ready: ya se puede generar (los demás llegan en etapas siguientes)
const REPORTS = {
  1: { level: 'company',  frameworks: ['ISO 42001 9.3', 'NIST Govern'], filters: ['period'], ready: true },
  2: { level: 'company',  frameworks: ['ISO 42001 6.1', 'NIST Map/Measure'], filters: [], ready: true },
  3: { level: 'division', frameworks: ['ISO 42001 A.4', 'EU AI Act art. 49', 'NIST Map'], filters: [], ready: true },
  4: { level: 'division', frameworks: ['ISO 42001 10.2', 'ISO 45001', 'OECD'], filters: ['period', 'status', 'severity'], ready: true },
  5: { level: 'division', frameworks: ['ISO 42001 10.2', 'ISO 45001 10.2'], filters: ['period'], ready: true },
  6: { level: 'division', frameworks: ['ISO 42001 8.1', 'ISO 45001 MOC', 'NIST Manage'], filters: ['period'], ready: true },
  7: { level: 'division', frameworks: ['ISO 42001 A.6/A.10', 'EU AI Act art. 11/13'], filters: [], ready: true },
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

// Filtro de cobertura para una tabla con branch_id (alias): agrega el parámetro y devuelve la condición
function cov(alias, P, p) {
  if (!P.coverage) return '';
  p.push(P.coverage.map(b => String(b.id)));
  return ` AND ${alias}.branch_id::text = ANY($${p.length}::text[])`;
}
const LIMIT_ROWS = `LIMIT ${DETAIL_LIMIT + 1}`;
const cut = rows => ({ rows: rows.slice(0, DETAIL_LIMIT), truncated: rows.length > DETAIL_LIMIT });

// ── Informe 3: Inventario de IA (fotografía a la fecha) ───────
// Datos por completar de una instalación: sus campos y sus secciones marcados como pendiente / no entregado
const INST_SECTION_TABLES = Object.values(I.INSTANCE_SECTIONS).map(s => s.table);
const instGaps = (state) => `(
  (SELECT count(*) FROM jsonb_each_text(i.field_status) e WHERE e.value = '${state}')
  ${INST_SECTION_TABLES.map(t => `+ COALESCE((SELECT count(*) FROM ${t} s, jsonb_each_text(s.field_status) e WHERE s.instance_id = i.id AND e.value = '${state}'), 0)`).join('\n  ')})::int`;
const modelGap = `(m.black_box OR EXISTS (SELECT 1 FROM jsonb_each_text(m.field_status) e WHERE e.value IN ('no_entregado','pendiente')))`;

async function inventoryCounts(db, user, P) {
  const p = [user.companyId];
  const ca = cov('a', P, p), ci = P.coverage ? ` AND i.branch_id::text = ANY($2::text[])` : '';
  const r = await db.query(`SELECT
    (SELECT count(*)::int FROM assets a WHERE a.company_id = $1 AND a.status = 'activo'${ca}) AS assets,
    (SELECT count(*)::int FROM assets a WHERE a.company_id = $1 AND a.status = 'activo' AND a.ai_usage <> 'usa_ia'${ca}) AS assets_unknown,
    (SELECT count(DISTINCT i.model_id)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${ci}) AS models,
    (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${ci}) AS installations,
    (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa' AND i.risk_level IN ('Critical','High')${ci}) AS high_risk,
    (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa' AND i.reclassification_pending${ci}) AS risk_to_review,
    (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa' AND i.next_review_date < CURRENT_DATE${ci}) AS reviews_overdue,
    (SELECT count(*)::int FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa' AND i.asset_id IS NULL${ci}) AS without_asset`, p);
  return r.rows[0];
}

async function inventoryPreview(db, user, P) {
  const c = await inventoryCounts(db, user, P);
  return { assets: c.assets, models: c.models, installations: c.installations, high_risk: c.high_risk };
}

async function inventoryReport(db, user, P) {
  const p = [user.companyId];
  const ci = cov('i', P, p);
  const [summary, byRisk, byDivision, inst, assets] = await Promise.all([
    inventoryCounts(db, user, P),
    db.query(`SELECT COALESCE(i.risk_level, 'none') AS risk_level, count(*)::int AS installations
      FROM ai_instances i WHERE i.company_id = $1 AND i.status = 'activa'${ci} GROUP BY 1`, p),
    db.query(`SELECT b.name AS division,
        (SELECT count(*)::int FROM assets a WHERE a.branch_id = b.id AND a.status = 'activo') AS assets,
        count(i.id)::int AS installations,
        count(i.id) FILTER (WHERE i.risk_level IN ('Critical','High'))::int AS high_risk,
        count(i.id) FILTER (WHERE i.reclassification_pending)::int AS risk_to_review
      FROM branches b LEFT JOIN ai_instances i ON i.branch_id = b.id AND i.status = 'activa'
      WHERE b.company_id = $1 AND b.status = 'active'${P.coverage ? ' AND b.id::text = ANY($2::text[])' : ''}
      GROUP BY b.id, b.name ORDER BY b.name`, p),
    db.query(`SELECT i.id, i.code, a.code AS asset_code, a.name AS asset_name, m.name AS model, m.vendor, v.version,
        i.risk_level, i.reclassification_pending, i.next_review_date, b.name AS division,
        ${instGaps('pendiente')} + ${instGaps('no_entregado')} AS gaps, ${modelGap} AS model_gap
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id JOIN branches b ON b.id = i.branch_id
      LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN model_versions v ON v.id = i.current_version_id
      WHERE i.company_id = $1 AND i.status = 'activa'${ci}
      ORDER BY b.name, a.code NULLS LAST, m.name ${LIMIT_ROWS}`, p),
    db.query(`SELECT a.code, a.name, a.ai_usage, b.name AS division
      FROM assets a JOIN branches b ON b.id = a.branch_id
      WHERE a.company_id = $1 AND a.status = 'activo' AND a.ai_usage <> 'usa_ia'${P.coverage ? ' AND a.branch_id::text = ANY($2::text[])' : ''}
      ORDER BY b.name, a.code ${LIMIT_ROWS}`, p)
  ]);
  const risk = Object.fromEntries(byRisk.rows.map(r => [r.risk_level, r.installations]));
  const I2 = cut(inst.rows), A2 = cut(assets.rows);
  return {
    summary,
    by_risk: ['Critical', 'High', 'Medium', 'Low', 'none'].map(l => ({ risk_level: l, installations: risk[l] || 0 })),
    by_division: byDivision.rows,
    installations: I2.rows, installations_truncated: I2.truncated,
    assets_unknown: A2.rows, assets_unknown_truncated: A2.truncated
  };
}

// ── Informe 5: Acciones correctivas (creadas en el período) ───
function actionsWhere(user, P) {
  const p = [user.companyId, P.filters.from, P.filters.to];
  const w = `x.company_id = $1 AND ac.created_at::date BETWEEN $2 AND $3${cov('x', P, p)}`;
  return { w, p };
}
const ACT_FROM = `FROM incident_actions ac JOIN ai_incidents x ON x.id = ac.incident_id JOIN branches b ON b.id = x.branch_id`;
const ACT_COUNTS = `count(*)::int AS actions,
  count(*) FILTER (WHERE ac.status = 'pendiente')::int AS pending,
  count(*) FILTER (WHERE ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE)::int AS overdue,
  count(*) FILTER (WHERE ac.status = 'terminada')::int AS done`;

async function actionsPreview(db, user, P) {
  const { w, p } = actionsWhere(user, P);
  return (await db.query(`SELECT ${ACT_COUNTS} ${ACT_FROM} WHERE ${w}`, p)).rows[0];
}

async function actionsReport(db, user, P) {
  const { w, p } = actionsWhere(user, P);
  const [summary, byOwner, byDivision, detail] = await Promise.all([
    db.query(`SELECT ${ACT_COUNTS},
        count(*) FILTER (WHERE ac.status = 'terminada' AND ac.done_at <= ac.due_date)::int AS done_on_time,
        count(*) FILTER (WHERE ac.status = 'terminada' AND ac.done_at > ac.due_date)::int AS done_late
      ${ACT_FROM} WHERE ${w}`, p),
    db.query(`SELECT ac.owner, ${ACT_COUNTS} ${ACT_FROM} WHERE ${w} GROUP BY ac.owner ORDER BY count(*) FILTER (WHERE ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE) DESC, count(*) DESC, ac.owner`, p),
    db.query(`SELECT b.name AS division, ${ACT_COUNTS} ${ACT_FROM} WHERE ${w} GROUP BY b.name ORDER BY b.name`, p),
    db.query(`SELECT ac.action, ac.owner, ac.due_date, ac.status, ac.done_at,
        (ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE) AS overdue,
        CASE WHEN ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE THEN CURRENT_DATE - ac.due_date
             WHEN ac.status = 'terminada' AND ac.done_at > ac.due_date THEN ac.done_at - ac.due_date ELSE 0 END::int AS days_late,
        x.id AS incident_id, x.title AS incident, x.severity, x.status AS incident_status, a.code AS asset_code, b.name AS division
      ${ACT_FROM} JOIN assets a ON a.id = x.asset_id WHERE ${w}
      ORDER BY (ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE) DESC, ac.status = 'terminada', ac.due_date ${LIMIT_ROWS}`, p)
  ]);
  const s = summary.rows[0];
  s.on_time_pct = s.done ? Math.round(100 * s.done_on_time / s.done) : null;
  const D = cut(detail.rows);
  return { summary: s, by_owner: byOwner.rows, by_division: byDivision.rows, detail: D.rows, detail_truncated: D.truncated };
}

// ── Informe 6: Gestión del cambio (cambios de versión en el período) ──
// Un cambio = una versión aplicada a una instalación que ya existía: después de otra versión, o la primera
// si la instalación se creó sin versión. Al aplicar una versión, BION guarda una copia de la ficha en la
// misma transacción (record_snapshots, misma hora), lo que la distingue de la versión con que se instaló.
function changesCte(user, P) {
  const p = [user.companyId, P.filters.from, P.filters.to];
  const ci = cov('i', P, p);
  const sql = `WITH h AS (
      SELECT iv.instance_id, iv.version_id, iv.valid_from,
        lag(iv.version_id) OVER (PARTITION BY iv.instance_id ORDER BY iv.valid_from, iv.created_at) AS prev_version_id,
        EXISTS (SELECT 1 FROM record_snapshots s WHERE s.entity_type = 'instancia' AND s.entity_id = iv.instance_id
          AND s.taken_at = iv.created_at) AS applied_later
      FROM instance_versions iv JOIN ai_instances i ON i.id = iv.instance_id
      WHERE i.company_id = $1${ci}),
    c AS (
      SELECT h.*, r.id AS review_id, r.reviewed_at, r.reviewed_by_email, r.substantial, r.risk_level AS review_risk,
        r.monitoring_days, r.monitoring_until, r.reopened_at
      FROM h LEFT JOIN LATERAL (
        SELECT * FROM instance_version_reviews r WHERE r.instance_id = h.instance_id AND r.version_id = h.version_id
        ORDER BY r.reviewed_at DESC LIMIT 1) r ON true
      WHERE (h.prev_version_id IS NOT NULL OR h.applied_later) AND h.valid_from BETWEEN $2 AND $3)`;
  return { sql, p };
}
const CHG_COUNTS = `count(*)::int AS changes,
  count(*) FILTER (WHERE c.review_id IS NOT NULL)::int AS reviewed,
  count(*) FILTER (WHERE c.review_id IS NULL)::int AS pending_review,
  count(*) FILTER (WHERE c.review_id IS NOT NULL AND c.monitoring_until >= CURRENT_DATE AND c.reopened_at IS NULL)::int AS in_monitoring`;

async function changesPreview(db, user, P) {
  const { sql, p } = changesCte(user, P);
  return (await db.query(`${sql} SELECT ${CHG_COUNTS} FROM c`, p)).rows[0];
}

async function changesReport(db, user, P) {
  const { sql, p } = changesCte(user, P);
  const pd = [...p, SERIOUS], sv = '$' + pd.length;   // gravedades graves, solo para el detalle
  const [summary, byModel, detail] = await Promise.all([
    db.query(`${sql} SELECT ${CHG_COUNTS},
        count(*) FILTER (WHERE c.substantial = 'si')::int AS substantial,
        count(*) FILTER (WHERE c.reopened_at IS NOT NULL)::int AS reopened,
        count(*) FILTER (WHERE v.changes_unknown)::int AS changes_unknown
      FROM c JOIN model_versions v ON v.id = c.version_id`, p),
    db.query(`${sql} SELECT m.name AS model, ${CHG_COUNTS}
      FROM c JOIN ai_instances i ON i.id = c.instance_id JOIN ai_models m ON m.id = i.model_id
      GROUP BY m.name ORDER BY count(*) DESC, m.name`, p),
    db.query(`${sql} SELECT c.valid_from AS changed_at, i.id AS instance_id, i.code, a.code AS asset_code, m.name AS model, b.name AS division,
        pv.version AS from_version, v.version AS to_version, v.changes_unknown,
        c.review_id IS NOT NULL AS reviewed, c.reviewed_at::date AS reviewed_at, c.reviewed_by_email, c.substantial, c.review_risk,
        c.monitoring_days, c.monitoring_until, c.reopened_at IS NOT NULL AS reopened,
        (c.review_id IS NOT NULL AND c.monitoring_until >= CURRENT_DATE AND c.reopened_at IS NULL) AS in_monitoring,
        -- Incidentes antes (mismos días que la vigilancia, antes del cambio) y durante la vigilancia
        (SELECT count(*)::int FROM ai_incidents x WHERE x.instance_id = c.instance_id
           AND x.occurred_at >= c.valid_from - COALESCE(c.monitoring_days, 30) AND x.occurred_at < c.valid_from) AS before_n,
        (SELECT count(*)::int FROM ai_incidents x WHERE x.instance_id = c.instance_id AND c.review_id IS NOT NULL
           AND x.occurred_at >= c.reviewed_at::date AND x.occurred_at <= LEAST(CURRENT_DATE, c.monitoring_until)) AS after_n,
        (SELECT count(*)::int FROM ai_incidents x WHERE x.instance_id = c.instance_id AND c.review_id IS NOT NULL AND x.severity = ANY(${sv})
           AND x.occurred_at >= c.reviewed_at::date AND x.occurred_at <= LEAST(CURRENT_DATE, c.monitoring_until)) AS after_serious
      FROM c JOIN ai_instances i ON i.id = c.instance_id JOIN ai_models m ON m.id = i.model_id JOIN branches b ON b.id = i.branch_id
      LEFT JOIN assets a ON a.id = i.asset_id JOIN model_versions v ON v.id = c.version_id
      LEFT JOIN model_versions pv ON pv.id = c.prev_version_id
      ORDER BY c.valid_from DESC, a.code NULLS LAST ${LIMIT_ROWS}`, pd)
  ]);
  const D = cut(detail.rows);
  return { summary: summary.rows[0], by_model: byModel.rows, detail: D.rows, detail_truncated: D.truncated };
}

// ── Informe 7: Brechas de información (fotografía a la fecha) ─
// Modelos usados en la cobertura (con instalaciones activas) y las instalaciones con datos marcados
async function gapsData(db, user, P) {
  const p = [user.companyId];
  const ci = cov('i', P, p);
  const models = await db.query(`
    SELECT m.id, m.code, m.name, m.vendor, m.black_box, m.vendor_questionnaire_sent_at, m.vendor_questionnaire_received,
      COALESCE((SELECT array_agg(e.key ORDER BY e.key) FROM jsonb_each_text(m.field_status) e WHERE e.value = 'no_entregado'), '{}') AS not_provided,
      COALESCE((SELECT array_agg(e.key ORDER BY e.key) FROM jsonb_each_text(m.field_status) e WHERE e.value = 'pendiente'), '{}') AS pending,
      count(i.id)::int AS installations
    FROM ai_models m JOIN ai_instances i ON i.model_id = m.id AND i.status = 'activa'${ci}
    WHERE m.company_id = $1 AND ${modelGap}
    GROUP BY m.id ORDER BY m.black_box DESC, m.name`, p);
  const inst = await db.query(`
    SELECT * FROM (
      SELECT i.id, i.code, a.code AS asset_code, m.name AS model, b.name AS division,
        ${instGaps('pendiente')} AS pending, ${instGaps('no_entregado')} AS not_provided
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id JOIN branches b ON b.id = i.branch_id LEFT JOIN assets a ON a.id = i.asset_id
      WHERE i.company_id = $1 AND i.status = 'activa'${ci}) t
    WHERE t.pending + t.not_provided > 0
    ORDER BY t.pending + t.not_provided DESC, t.asset_code NULLS LAST ${LIMIT_ROWS}`, p);
  return { models: models.rows, inst: inst.rows };
}

function gapsSummary(g) {
  return {
    models_with_gaps: g.models.length,
    black_box: g.models.filter(m => m.black_box).length,
    vendor_fields_not_provided: g.models.reduce((n, m) => n + m.not_provided.length, 0),
    installations_with_gaps: Math.min(g.inst.length, DETAIL_LIMIT),
    questionnaire_not_sent: g.models.filter(m => m.black_box && !m.vendor_questionnaire_sent_at && !m.vendor_questionnaire_received).length,
    internal_fields_pending: g.models.reduce((n, m) => n + m.pending.length, 0) + g.inst.slice(0, DETAIL_LIMIT).reduce((n, i) => n + i.pending + i.not_provided, 0)
  };
}

async function gapsPreview(db, user, P) {
  const s = gapsSummary(await gapsData(db, user, P));
  return { models_with_gaps: s.models_with_gaps, black_box: s.black_box, vendor_fields_not_provided: s.vendor_fields_not_provided, installations_with_gaps: s.installations_with_gaps };
}

async function gapsReport(db, user, P) {
  const g = await gapsData(db, user, P);
  const D = cut(g.inst);
  return { summary: gapsSummary(g), models: g.models, installations: D.rows, installations_truncated: D.truncated };
}

// ── Informe 1: Estado Global de la IA en la Organización ──────
// Revisión por la dirección (ISO 42001 9.3): reúne los demás informes a nivel empresa, con desglose por división
async function globalByDivision(db, user, P) {
  const p = [user.companyId, P.filters.from, P.filters.to];
  return (await db.query(`
    SELECT b.name AS division,
      (SELECT count(*)::int FROM ai_instances i WHERE i.branch_id = b.id AND i.status = 'activa') AS installations,
      (SELECT count(*)::int FROM ai_instances i WHERE i.branch_id = b.id AND i.status = 'activa' AND i.risk_level IN ('Critical','High')) AS high_risk,
      (SELECT count(*)::int FROM ai_instances i WHERE i.branch_id = b.id AND i.status = 'activa' AND i.reclassification_pending) AS risk_to_review,
      (SELECT count(*)::int FROM ai_incidents x WHERE x.branch_id = b.id AND x.occurred_at BETWEEN $2 AND $3) AS incidents,
      (SELECT count(*)::int FROM ai_incidents x WHERE x.branch_id = b.id AND x.occurred_at BETWEEN $2 AND $3 AND x.severity = ANY('{incidente_grave,desastre}')) AS serious,
      (SELECT count(*)::int FROM ai_incidents x WHERE x.branch_id = b.id AND x.status = 'abierto') AS open_now,
      (SELECT count(*)::int FROM incident_actions ac JOIN ai_incidents x ON x.id = ac.incident_id
         WHERE x.branch_id = b.id AND ac.status = 'pendiente' AND ac.due_date < CURRENT_DATE) AS actions_overdue
    FROM branches b WHERE b.company_id = $1 AND b.status = 'active' ORDER BY b.name`, p)).rows;
}

// Incidentes por mes: los 12 meses que terminan en el mes final del período
async function incidentTrend(db, user, P) {
  return (await db.query(`
    SELECT to_char(m, 'YYYY-MM') AS month,
      count(x.id)::int AS incidents,
      count(x.id) FILTER (WHERE x.severity = ANY('{incidente_grave,desastre}'))::int AS serious
    FROM generate_series(date_trunc('month', $2::date) - INTERVAL '11 months', date_trunc('month', $2::date), INTERVAL '1 month') m
    LEFT JOIN ai_incidents x ON x.company_id = $1 AND date_trunc('month', x.occurred_at) = m
    GROUP BY m ORDER BY m`, [user.companyId, P.filters.to])).rows;
}

async function globalPreview(db, user, P) {
  const [inc, act, inv] = await Promise.all([incidentsPreview(db, user, P), actionsPreview(db, user, P), inventoryCounts(db, user, P)]);
  return { incidents: inc.incidents, serious: inc.serious, actions_overdue: inc.actions_overdue, risk_to_review: inv.risk_to_review };
}

async function globalReport(db, user, P) {
  const [inventory, incidents, actions, changes, gaps, pend, byDivision, trend] = await Promise.all([
    inventoryCounts(db, user, P),
    incidentsReport(db, user, P),
    actionsReport(db, user, P),
    changesPreview(db, user, P),
    gapsData(db, user, P),
    pending(db, user, {}),
    globalByDivision(db, user, P),
    incidentTrend(db, user, P)
  ]);
  return {
    inventory,
    incidents: { ...incidents.summary, by_severity: incidents.by_severity, by_model: incidents.by_model.slice(0, 5) },
    actions: actions.summary,
    changes,
    gaps: gapsSummary(gaps),
    pending: pend.counts,
    by_division: byDivision,
    trend
  };
}

// ── Informe 2: Mapa de riesgo de IA (fotografía a la fecha) ───
async function riskMatrix(db, user) {
  return (await db.query(`
    SELECT b.name AS division,
      count(i.id) FILTER (WHERE i.risk_level = 'Critical')::int AS "Critical",
      count(i.id) FILTER (WHERE i.risk_level = 'High')::int AS "High",
      count(i.id) FILTER (WHERE i.risk_level = 'Medium')::int AS "Medium",
      count(i.id) FILTER (WHERE i.risk_level = 'Low')::int AS "Low",
      count(i.id) FILTER (WHERE i.risk_level IS NULL)::int AS none,
      count(i.id)::int AS total,
      count(i.id) FILTER (WHERE i.reclassification_pending)::int AS risk_to_review,
      count(i.id) FILTER (WHERE i.next_review_date < CURRENT_DATE)::int AS reviews_overdue,
      (SELECT count(*)::int FROM ai_incidents x WHERE x.branch_id = b.id AND x.status = 'abierto'
         AND x.severity = ANY('{incidente_grave,desastre}')) AS serious_open
    FROM branches b LEFT JOIN ai_instances i ON i.branch_id = b.id AND i.status = 'activa'
    WHERE b.company_id = $1 AND b.status = 'active'
    GROUP BY b.id, b.name ORDER BY b.name`, [user.companyId])).rows;
}

async function riskPreview(db, user) {
  const m = await riskMatrix(db, user);
  const sum = k => m.reduce((n, r) => n + r[k], 0);
  return { installations: sum('total'), critical: sum('Critical'), high: sum('High'), risk_to_review: sum('risk_to_review') };
}

async function riskReport(db, user) {
  const [matrix, models] = await Promise.all([
    riskMatrix(db, user),
    // Modelos con instalaciones de riesgo crítico o alto, y dónde están
    db.query(`
      SELECT m.code, m.name, m.vendor, m.base_risk_level, m.black_box,
        count(i.id) FILTER (WHERE i.risk_level = 'Critical')::int AS critical,
        count(i.id) FILTER (WHERE i.risk_level = 'High')::int AS high,
        count(i.id) FILTER (WHERE i.reclassification_pending)::int AS risk_to_review,
        array_agg(DISTINCT b.name ORDER BY b.name) AS divisions,
        (SELECT count(*)::int FROM ai_incidents x JOIN ai_instances xi ON xi.id = x.instance_id
           WHERE xi.model_id = m.id AND x.occurred_at >= CURRENT_DATE - INTERVAL '12 months') AS incidents_12m
      FROM ai_models m JOIN ai_instances i ON i.model_id = m.id AND i.status = 'activa' JOIN branches b ON b.id = i.branch_id
      WHERE m.company_id = $1 AND i.risk_level IN ('Critical','High')
      GROUP BY m.id ORDER BY count(i.id) FILTER (WHERE i.risk_level = 'Critical') DESC, count(i.id) DESC, m.name`, [user.companyId])
  ]);
  const sum = k => matrix.reduce((n, r) => n + r[k], 0);
  const totals = Object.fromEntries(['Critical', 'High', 'Medium', 'Low', 'none', 'total', 'risk_to_review', 'reviews_overdue', 'serious_open'].map(k => [k, sum(k)]));
  return { matrix, totals, models: models.rows };
}

// Generadores por informe (el 8 se genera desde la ficha del incidente)
const BUILDERS = {
  1: { preview: globalPreview, generate: globalReport },
  2: { preview: riskPreview, generate: riskReport },
  3: { preview: inventoryPreview, generate: inventoryReport },
  4: { preview: incidentsPreview, generate: incidentsReport },
  5: { preview: actionsPreview, generate: actionsReport },
  6: { preview: changesPreview, generate: changesReport },
  7: { preview: gapsPreview, generate: gapsReport }
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
