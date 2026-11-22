// ============================================================
// Incidentes — /api/incidents
//   GET  /api/incidents?division=&asset_id=&model_id=&from=&to=&kind=&severity=&status=&eu_serious=&undetermined=
//   GET  /api/incidents?id=
//   POST /api/incidents            registrar (la versión se calcula sola)
//   PUT  /api/incidents?id=        editar (si cambia la instancia o la fecha, se recalcula la versión)
// Los incidentes no se borran: se cierran (status = 'cerrado').
// Diseño: docs/activos-y-modelos.md, regla 4
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, resolveDivision, pickKnownFields, sendError } = require('./_auth');
const I = require('./_inventory');

const INCIDENT_FIELDS = [
  'asset_id', 'instance_id', 'occurred_at', 'title', 'description', 'incident_type', 'kind', 'severity',
  'eu_serious_incident', 'status', 'root_cause_technical', 'root_cause_organizational', 'lessons_learned',
  'requires_regulator_notification', 'regulator_authority', 'notification_deadline'
];
const KINDS = ['incidente', 'cuasi_incidente'];
const SEVERITIES = ['leve', 'moderado', 'grave', 'critico'];
const STATUSES = ['abierto', 'en_investigacion', 'cerrado'];

const SELECT = `
  SELECT x.*, a.code AS asset_code, a.name AS asset_name, b.name AS branch_name,
         i.code AS instance_code, m.id AS model_id, m.name AS model_name, v.version
  FROM ai_incidents x JOIN assets a ON a.id = x.asset_id JOIN branches b ON b.id = x.branch_id
  LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id
  LEFT JOIN model_versions v ON v.id = x.version_id`;

async function loadIncident(db, user, id) {
  const r = await db.query(`${SELECT} WHERE x.id::text = $1 AND x.company_id = $2`, [String(id), user.companyId]);
  const inc = r.rows[0];
  if (!inc) throw { status: 404, message: 'Incident not found' };
  const scope = assertCan(user, 'inventory.view');
  if (scope === 'division' && String(inc.branch_id) !== String(user.divisionId)) throw { status: 404, message: 'Incident not found' };
  return inc;
}

// Versión de la instancia en la fecha del incidente (null si no tenía versión registrada)
async function versionAt(db, instance, date) {
  const hist = await db.query('SELECT version_id, valid_from, valid_to FROM instance_versions WHERE instance_id = $1', [instance.id]);
  if (hist.rows.length) {
    const row = hist.rows.find(h => String(h.valid_from) <= date && (!h.valid_to || String(h.valid_to) > date));
    if (!row) throw I.badRequest('The model was not installed on that date');
    return row.version_id;
  }
  if (instance.installed_at && String(instance.installed_at) > date) throw I.badRequest('The model was not installed on that date');
  if (instance.retired_at && String(instance.retired_at) <= date) throw I.badRequest('The model was not installed on that date');
  return null;
}

// Valida el incidente completo (valores combinados del existente y los cambios)
async function validate(db, user, inc) {
  if (!inc.title || !String(inc.title).trim()) throw I.badRequest('Title required');
  if (!inc.occurred_at) throw I.badRequest('Date required');
  I.assertDate(inc.occurred_at, 'occurred_at');
  if (inc.occurred_at > I.today()) throw I.badRequest('Date cannot be in the future');
  I.assertDate(inc.notification_deadline, 'notification_deadline');
  I.assertOneOf(inc.kind, KINDS, 'kind');
  if (!inc.severity) throw I.badRequest('Severity required');
  I.assertOneOf(inc.severity, SEVERITIES, 'severity');
  I.assertOneOf(inc.status, STATUSES, 'status');
  for (const k of ['eu_serious_incident', 'requires_regulator_notification']) {
    if (inc[k] !== undefined && inc[k] !== null && typeof inc[k] !== 'boolean') throw I.badRequest(`Invalid value: ${k}`);
  }
  // Incidente grave según EU AI Act art. 73: exige notificación al regulador
  if (inc.eu_serious_incident === true) {
    inc.requires_regulator_notification = true;
    if (!inc.regulator_authority || !inc.notification_deadline) {
      throw I.badRequest('EU AI Act serious incident requires regulator authority and notification deadline');
    }
  }

  const a = await db.query(`SELECT id, branch_id FROM assets WHERE id::text = $1 AND company_id = $2`, [String(inc.asset_id || ''), user.companyId]);
  if (!a.rows[0]) throw { status: 404, message: 'Asset not found' };
  inc.branch_id = a.rows[0].branch_id;

  inc.version_id = null;
  if (inc.instance_id) {
    const r = await db.query(`SELECT id, asset_id, installed_at, retired_at FROM ai_instances WHERE id::text = $1 AND company_id = $2`,
      [String(inc.instance_id), user.companyId]);
    const inst = r.rows[0];
    if (!inst) throw { status: 404, message: 'Instance not found' };
    if (String(inst.asset_id) !== String(a.rows[0].id)) throw I.badRequest('The instance does not belong to this asset');
    inc.version_id = await versionAt(db, inst, inc.occurred_at);
  }
}

async function list(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const params = [user.companyId];
  const where = ['x.company_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', '$' + params.length)); };
  if (division) add('x.branch_id::text = ?', division);
  if (q.asset_id) add('x.asset_id::text = ?', String(q.asset_id));
  if (q.model_id) add('m.id::text = ?', String(q.model_id));
  if (q.instance_id) add('x.instance_id::text = ?', String(q.instance_id));
  if (q.from) { I.assertDate(q.from, 'from'); add('x.occurred_at >= ?', q.from); }
  if (q.to) { I.assertDate(q.to, 'to'); add('x.occurred_at <= ?', q.to); }
  if (q.kind) add('x.kind = ?', q.kind);
  if (q.severity) add('x.severity = ?', q.severity);
  if (q.status) add('x.status = ?', q.status);
  if (q.eu_serious === 'true') where.push('x.eu_serious_incident');
  if (q.undetermined === 'true') where.push('x.instance_id IS NULL');
  const r = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY x.occurred_at DESC, x.created_at DESC`, params);
  return r.rows;
}

async function create(pool, user, body) {
  assertCan(user, 'incident.write');
  const f = pickKnownFields(body, INCIDENT_FIELDS);
  f.kind = f.kind || 'incidente';
  f.status = f.status || 'abierto';
  return I.inTransaction(pool, async db => {
    await validate(db, user, f);
    if (f.instance_id) f.instance_assigned_at = new Date().toISOString();
    const row = { ...f, company_id: user.companyId, reported_by: I.asUuid(user.userId) };
    const keys = Object.keys(row);
    const r = await db.query(
      `INSERT INTO ai_incidents (${keys.join(', ')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
      Object.values(row));
    return { id: r.rows[0].id, version_id: f.version_id };
  });
}

async function update(pool, user, id, body) {
  assertCan(user, 'incident.write');
  const changes = pickKnownFields(body, INCIDENT_FIELDS);
  if (!Object.keys(changes).length) throw I.badRequest('Nothing to update');
  return I.inTransaction(pool, async db => {
    const cur = await loadIncident(db, user, id);
    const merged = {};
    for (const k of INCIDENT_FIELDS) merged[k] = k in changes ? changes[k] : cur[k];
    await validate(db, user, merged);
    const instanceChanged = 'instance_id' in changes && String(changes.instance_id || '') !== String(cur.instance_id || '');
    const set = { ...merged };
    if (instanceChanged) set.instance_assigned_at = merged.instance_id ? new Date().toISOString() : null;
    const keys = Object.keys(set);
    await db.query(
      `UPDATE ai_incidents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [cur.id, ...Object.values(set)]);
    return { success: true, version_id: merged.version_id };
  });
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  const pool = getClientPool(user.dbName);
  const { id } = req.query;
  try {
    if (req.method === 'GET' && id) return res.status(200).json(await loadIncident(pool, user, id));
    if (req.method === 'GET') return res.status(200).json(await list(pool, user, req.query));
    if (req.method === 'POST') return res.status(201).json(await create(pool, user, req.body || {}));
    if (req.method === 'PUT' && id) return res.status(200).json(await update(pool, user, id, req.body || {}));
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};
