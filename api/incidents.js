// ============================================================
// Incidentes — /api/incidents   (diseño: docs/incidentes.md)
//   GET    ?meta=1                                datos de la empresa para el registro (país, sector, EU AI Act)
//   GET    ?division=&status=&severity=&kind=&q=&asset_id=&model_id=&instance_id=&from=&to=&undetermined=   lista
//   GET    ?id=                                   ficha: incidente, acciones, datos sugeridos del inventario
//   POST                                          registrar (asistente: CSET + OECD). Queda abierto.
//   PUT    ?id=&section=registro|personas|contexto|eu|cierre     guardar una pestaña
//   POST   ?id=&actions=1                         agregar acción correctiva { action, owner, due_date }
//   PUT    ?id=&action_id=                        editar acción { action?, owner?, due_date?, status? }
//   DELETE ?id=&action_id=                        borrar acción
//   POST   ?id=&do=close                          cerrar (exige causa raíz, verificación y acciones terminadas)
// Estados: solo 'abierto' y 'cerrado'. Un incidente cerrado ya no se edita.
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { getMasterPool } = require('./_helpers');
const { verifyClient, assertCan, can, resolveDivision, pickKnownFields, sendError } = require('./_auth');
const I = require('./_inventory');

// ── Valores permitidos ────────────────────────────────────────
const KINDS = ['incidente', 'peligro'];
const SEVERITIES = ['incidente', 'incidente_grave', 'desastre'];
const LISTS = {
  harmed_targets:  ['personas', 'equipo_vehiculo', 'instalacion', 'mismo_activo', 'medio_ambiente', 'datos'],
  harm_types:      ['fisico_salud', 'psicologico', 'economico', 'reputacional', 'ambiental', 'interes_publico', 'derechos_humanos', 'propiedad_intelectual'],
  affected_groups: ['trabajadores', 'consumidores', 'grupos_vulnerables', 'empresas', 'publico'],
  oecd_principles: ['bienestar', 'derechos_equidad_privacidad', 'transparencia', 'robustez_seguridad', 'rendicion_cuentas'],
  data_issues:     ['sesgados', 'erroneos', 'no_representativos', 'sin_consentimiento', 'no_se_sabe'],
  eu_criteria:     ['muerte_salud', 'infraestructura_critica', 'derechos_fundamentales', 'propiedad_ambiente'],
  measures_taken:  ['corrigio', 'alerta', 'retiro', 'investigacion_legal']
};
const ONE_OF = {
  kind: KINDS, severity: SEVERITIES,
  ai_behavior: ['actuo_mal', 'no_detecto', 'mal_uso', 'no_claro'],
  ai_link: ['causo', 'contribuyo', 'no_claro']
};
const DATES = ['occurred_at', 'notification_deadline', 'eu_notified_at'];
const ACTION_STATUSES = ['pendiente', 'terminada'];

// Campos de cada pestaña (la creación usa los de "registro")
const SECTIONS = {
  registro: ['asset_id', 'instance_id', 'occurred_at', 'occurred_time', 'harmed_targets', 'harmed_description', 'title', 'description',
             'ai_behavior', 'ai_link', 'kind', 'harm_types', 'severity', 'country', 'location', 'evidence_links'],
  personas: ['affected_groups', 'injured_count', 'oecd_principles'],
  contexto: ['sector', 'deployment_scope', 'data_issues', 'model_type', 'explainability', 'robustness_failure', 'ai_task', 'autonomy', 'human_oversight'],
  eu:       ['eu_criteria', 'regulator_authority', 'notification_deadline', 'eu_notified_at', 'eu_notification_ref'],
  cierre:   ['measures_taken', 'root_cause_technical', 'root_cause_organizational', 'effectiveness_check', 'lessons_learned']
};
// Obligatorios al registrar
const REQUIRED = ['asset_id', 'occurred_at', 'title', 'kind', 'severity', 'ai_behavior', 'ai_link', 'harmed_targets', 'harm_types'];

const SELECT = `
  SELECT x.*, a.code AS asset_code, a.name AS asset_name, b.name AS branch_name,
         i.code AS instance_code, m.id AS model_id, m.name AS model_name, v.version
  FROM ai_incidents x JOIN assets a ON a.id = x.asset_id JOIN branches b ON b.id = x.branch_id
  LEFT JOIN ai_instances i ON i.id = x.instance_id LEFT JOIN ai_models m ON m.id = i.model_id
  LEFT JOIN model_versions v ON v.id = x.version_id`;

// ── Datos de la empresa (BD maestra): país, sector y ajuste EU AI Act ──
async function companyMeta(user) {
  try {
    const r = await getMasterPool().query(`
      SELECT c.country, c.eu_ai_act_enabled, COALESCE(t.label, c.industry) AS sector
      FROM companies c LEFT JOIN inventory_types t ON t.code = c.industry WHERE c.id::text = $1`, [String(user.companyId)]);
    const c = r.rows[0] || {};
    return { country: c.country || user.country || null, sector: c.sector || null, eu_enabled: c.eu_ai_act_enabled === true };
  } catch (e) {
    // Sin la migración 004 maestra (o sin tabla de tipos): EU AI Act desactivado
    if (['42703', '42P01'].includes(e.code)) return { country: user.country || null, sector: null, eu_enabled: false };
    throw e;
  }
}

// ── Validación de valores ─────────────────────────────────────
function clean(f) {
  for (const [k, allowed] of Object.entries(LISTS)) {
    if (!(k in f)) continue;
    if (f[k] === null) { f[k] = []; continue; }
    if (!Array.isArray(f[k]) || f[k].some(v => !allowed.includes(v))) throw I.badRequest(`Invalid value: ${k}`);
    f[k] = [...new Set(f[k])];
  }
  for (const [k, allowed] of Object.entries(ONE_OF)) if (k in f && f[k] !== null) I.assertOneOf(f[k], allowed, k);
  DATES.forEach(k => I.assertDate(f[k], k));
  if (f.occurred_time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(f.occurred_time))) throw I.badRequest('Invalid value: occurred_time');
  if ('injured_count' in f && f.injured_count !== null && (!Number.isInteger(f.injured_count) || f.injured_count < 0)) throw I.badRequest('Invalid value: injured_count');
  if ('evidence_links' in f) {
    const links = f.evidence_links || [];
    if (!Array.isArray(links) || links.length > 20) throw I.badRequest('Invalid value: evidence_links');
    f.evidence_links = JSON.stringify(links.map(l => {
      const url = l && String(l.url || '').trim(), label = l && String(l.label || '').trim();
      if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000 || label.length > 200) throw I.badRequest('Invalid value: evidence_links');
      return { label: label || url, url };
    }));
  }
  for (const [k, v] of Object.entries(f)) {
    if (typeof v === 'string') {
      if (v.length > 5000) throw I.badRequest(`Invalid value: ${k}`);
      f[k] = v.trim() === '' ? null : v.trim();
    }
  }
  return f;
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

// Activo, división, instancia y versión (registro completo, valores combinados)
async function resolveWhere(db, user, inc) {
  if (!inc.title) throw I.badRequest('Title required');
  if (!inc.occurred_at) throw I.badRequest('Date required');
  if (inc.occurred_at > I.today()) throw I.badRequest('Date cannot be in the future');
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

// Un incidente grave durante la vigilancia de una revisión de cambio de versión
// devuelve la instalación a "Riesgo por revisar" (migración 005)
async function reopenReviewIfSerious(db, inc) {
  if (!inc.instance_id || !['incidente_grave', 'desastre'].includes(inc.severity)) return false;
  if (!(await db.query(`SELECT to_regclass('instance_version_reviews') AS t`)).rows[0].t) return false;
  const r = await db.query(`
    UPDATE instance_version_reviews r SET reopened_at = NOW(), reopened_by_incident = $2
    WHERE r.id = (SELECT id FROM instance_version_reviews WHERE instance_id::text = $1 ORDER BY reviewed_at DESC LIMIT 1)
      AND r.reopened_at IS NULL AND $3::date BETWEEN r.reviewed_at::date AND r.monitoring_until
    RETURNING r.instance_id`, [String(inc.instance_id), inc.id, inc.occurred_at]);
  if (!r.rowCount) return false;
  await db.query('UPDATE ai_instances SET reclassification_pending = true, updated_at = NOW() WHERE id = $1', [r.rows[0].instance_id]);
  return true;
}

async function loadIncident(db, user, id) {
  const r = await db.query(`${SELECT} WHERE x.id::text = $1 AND x.company_id = $2`, [String(id), user.companyId]);
  const inc = r.rows[0];
  if (!inc) throw { status: 404, message: 'Incident not found' };
  const scope = assertCan(user, 'inventory.view');
  if (scope === 'division' && String(inc.branch_id) !== String(user.divisionId)) throw { status: 404, message: 'Incident not found' };
  return inc;
}

// Quien edita: debe poder editar y, si es de división, solo su división. Cerrado = no se edita.
async function loadForWrite(db, user, id) {
  const scope = assertCan(user, 'incident.write');
  const inc = await loadIncident(db, user, id);
  if (scope === 'division' && String(inc.branch_id) !== String(user.divisionId)) throw { status: 404, message: 'Incident not found' };
  if (inc.status === 'cerrado') throw I.badRequest('Incident is closed');
  return inc;
}

// ── Datos sugeridos desde el inventario (pestaña Contexto y técnica) ──
async function suggestions(db, inc, meta) {
  const s = { sector: { value: meta.sector, source: 'empresa' } };
  if (!inc.instance_id) return s;
  const r = await db.query(`
    SELECT i.deployment_status, i.autonomy_level, i.requires_human_supervision,
           m.model_type, m.main_function, m.black_box, m.field_status AS model_fs, h.kill_switch_mechanism
    FROM ai_instances i JOIN ai_models m ON m.id = i.model_id
    LEFT JOIN inst_human_supervision h ON h.instance_id = i.id WHERE i.id = $1`, [inc.instance_id]);
  const x = r.rows[0];
  if (!x) return s;
  const fs = x.model_fs || {};
  s.deployment_scope = { value: x.deployment_status, source: 'instalacion' };
  s.model_type = { value: x.model_type, source: 'modelo', state: fs.model_type || null };
  s.explainability = { value: x.black_box ? 'Baja — caja negra' : null, source: 'modelo' };
  s.ai_task = { value: x.main_function, source: 'modelo', state: fs.main_function || null };
  s.autonomy = { value: x.autonomy_level != null ? `Nivel ${x.autonomy_level}` : null, source: 'instalacion' };
  s.human_oversight = { value: x.kill_switch_mechanism || x.requires_human_supervision || null, source: 'instalacion' };
  return s;
}

async function detail(db, user, id) {
  const inc = await loadIncident(db, user, id);
  const meta = await companyMeta(user);
  const actions = await db.query(
    `SELECT id, action, owner, due_date, status, done_at, (status = 'pendiente' AND due_date < CURRENT_DATE) AS overdue
     FROM incident_actions WHERE incident_id = $1 ORDER BY due_date, created_at`, [inc.id]);
  return { incident: inc, actions: actions.rows, eu_enabled: meta.eu_enabled, suggestions: await suggestions(db, inc, meta) };
}

async function list(db, user, q) {
  assertCan(user, 'inventory.view');
  const division = await resolveDivision(db, user, q.division);
  const params = [user.companyId];
  const where = ['x.company_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace(/\?/g, '$' + params.length)); };
  if (division) add('x.branch_id::text = ?', division);
  if (q.status) { I.assertOneOf(q.status, ['abierto', 'cerrado'], 'status'); add('x.status = ?', q.status); }
  if (q.severity) add('x.severity = ?', q.severity);
  if (q.kind) add('x.kind = ?', q.kind);
  if (q.asset_id) add('x.asset_id::text = ?', String(q.asset_id));
  if (q.model_id) add('m.id::text = ?', String(q.model_id));
  if (q.instance_id) add('x.instance_id::text = ?', String(q.instance_id));
  if (q.from) { I.assertDate(q.from, 'from'); add('x.occurred_at >= ?', q.from); }
  if (q.to) { I.assertDate(q.to, 'to'); add('x.occurred_at <= ?', q.to); }
  if (q.q) add(`(x.title ILIKE ? OR a.code ILIKE ? OR a.name ILIKE ? OR m.name ILIKE ?)`, '%' + String(q.q).trim() + '%');
  if (q.undetermined === 'true') where.push('x.instance_id IS NULL');
  const r = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY x.occurred_at DESC, x.created_at DESC`, params);
  return r.rows;
}

async function create(pool, user, body) {
  const scope = assertCan(user, 'incident.create');
  const f = clean(pickKnownFields(body, SECTIONS.registro));
  for (const k of REQUIRED) {
    const v = f[k];
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) throw I.badRequest(`${k} required`);
  }
  return I.inTransaction(pool, async db => {
    await resolveWhere(db, user, f);
    // Roles de división: solo en activos de su división
    if (scope === 'division' && String(f.branch_id) !== String(user.divisionId)) throw { status: 404, message: 'Asset not found' };
    if (f.instance_id) f.instance_assigned_at = new Date().toISOString();
    if (!f.country) f.country = (await companyMeta(user)).country;
    const row = { ...f, status: 'abierto', company_id: user.companyId, reported_by: I.asUuid(user.userId), reported_by_email: user.email || null };
    const keys = Object.keys(row);
    const r = await db.query(
      `INSERT INTO ai_incidents (${keys.join(', ')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING id`,
      Object.values(row));
    const reopened = await reopenReviewIfSerious(db, { ...f, id: r.rows[0].id });
    return { id: r.rows[0].id, version_id: f.version_id, review_reopened: reopened };
  });
}

async function updateSection(pool, user, id, section, body) {
  const fields = SECTIONS[section];
  if (!fields) throw I.badRequest('Invalid section');
  const changes = clean(pickKnownFields(body, fields));
  if (!Object.keys(changes).length) throw I.badRequest('Nothing to update');
  return I.inTransaction(pool, async db => {
    const cur = await loadForWrite(db, user, id);
    const set = { ...changes };

    if (section === 'registro') {
      const merged = { ...cur, ...changes };
      for (const k of REQUIRED) {
        const v = merged[k];
        if (v === undefined || v === null || (Array.isArray(v) && !v.length)) throw I.badRequest(`${k} required`);
      }
      await resolveWhere(db, user, merged);
      if (String(merged.branch_id) !== String(cur.branch_id) && can(user, 'incident.write') === 'division') {
        throw { status: 404, message: 'Asset not found' };
      }
      set.branch_id = merged.branch_id;
      set.version_id = merged.version_id;
      if ('instance_id' in changes && String(changes.instance_id || '') !== String(cur.instance_id || '')) {
        set.instance_assigned_at = changes.instance_id ? new Date().toISOString() : null;
      }
    }

    if (section === 'eu') {
      if (!(await companyMeta(user)).eu_enabled) throw I.badRequest('EU AI Act is not enabled for this company');
      const m = { ...cur, ...changes };
      const serious = (m.eu_criteria || []).length > 0;
      // Incidente grave según art. 73: exige autoridad y plazo de notificación
      if (serious && (!m.regulator_authority || !m.notification_deadline)) {
        throw I.badRequest('EU AI Act serious incident requires regulator authority and notification deadline');
      }
      set.eu_serious_incident = serious;
      set.requires_regulator_notification = serious;
    }

    const keys = Object.keys(set);
    await db.query(
      `UPDATE ai_incidents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [cur.id, ...Object.values(set)]);
    if (section === 'registro') await reopenReviewIfSerious(db, { ...cur, ...changes, id: cur.id });
    return { success: true, version_id: set.version_id };
  });
}

// ── Acciones correctivas ──────────────────────────────────────
function cleanAction(b, creating) {
  const f = pickKnownFields(b, ['action', 'owner', 'due_date', 'status']);
  for (const k of ['action', 'owner']) {
    if (creating || k in f) {
      if (!f[k] || !String(f[k]).trim()) throw I.badRequest(`${k} required`);
      f[k] = String(f[k]).trim().slice(0, 1000);
    }
  }
  if (creating && !f.due_date) throw I.badRequest('due_date required');
  if ('due_date' in f) { if (!f.due_date) throw I.badRequest('due_date required'); I.assertDate(f.due_date, 'due_date'); }
  if ('status' in f) I.assertOneOf(f.status, ACTION_STATUSES, 'status');
  return f;
}

async function addAction(pool, user, id, body) {
  const f = cleanAction(body, true);
  return I.inTransaction(pool, async db => {
    const inc = await loadForWrite(db, user, id);
    const r = await db.query(
      `INSERT INTO incident_actions (incident_id, action, owner, due_date, status, done_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [inc.id, f.action, f.owner, f.due_date, f.status || 'pendiente', f.status === 'terminada' ? I.today() : null, I.asUuid(user.userId)]);
    return { id: r.rows[0].id };
  });
}

async function changeAction(pool, user, id, actionId, method, body) {
  return I.inTransaction(pool, async db => {
    const inc = await loadForWrite(db, user, id);
    const r = await db.query('SELECT * FROM incident_actions WHERE id::text = $1 AND incident_id = $2', [String(actionId), inc.id]);
    const act = r.rows[0];
    if (!act) throw { status: 404, message: 'Action not found' };
    if (method === 'DELETE') {
      await db.query('DELETE FROM incident_actions WHERE id = $1', [act.id]);
      return { success: true };
    }
    const f = cleanAction(body, false);
    if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
    if ('status' in f && f.status !== act.status) f.done_at = f.status === 'terminada' ? I.today() : null;
    const keys = Object.keys(f);
    await db.query(
      `UPDATE incident_actions SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [act.id, ...Object.values(f)]);
    return { success: true };
  });
}

// ── Cierre (ISO 42001 10.2) ───────────────────────────────────
async function close(pool, user, id) {
  return I.inTransaction(pool, async db => {
    const inc = await loadForWrite(db, user, id);
    const missing = [];
    if (!inc.root_cause_technical && !inc.root_cause_organizational) missing.push('root_cause');
    if (!inc.effectiveness_check) missing.push('effectiveness_check');
    const p = await db.query(`SELECT count(*)::int AS n FROM incident_actions WHERE incident_id = $1 AND status = 'pendiente'`, [inc.id]);
    if (p.rows[0].n) missing.push('pending_actions');
    if (missing.length) throw { status: 400, message: 'Incident cannot be closed yet', missing, pending_actions: p.rows[0].n };
    await db.query(
      `UPDATE ai_incidents SET status = 'cerrado', closed_at = NOW(), closed_by = $2, closed_by_email = $3, updated_at = NOW() WHERE id = $1`,
      [inc.id, I.asUuid(user.userId), user.email || null]);
    return { success: true };
  });
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  const pool = getClientPool(user.dbName);
  const { id, section, action_id } = req.query;
  const body = req.body || {};
  const m = req.method;
  try {
    if (m === 'GET' && req.query.meta) { assertCan(user, 'inventory.view'); return res.status(200).json(await companyMeta(user)); }
    if (m === 'GET' && id) return res.status(200).json(await detail(pool, user, id));
    if (m === 'GET') return res.status(200).json(await list(pool, user, req.query));
    if (m === 'POST' && !id) return res.status(201).json(await create(pool, user, body));
    if (m === 'POST' && id && req.query.do === 'close') return res.status(200).json(await close(pool, user, id));
    if (m === 'POST' && id && req.query.actions) return res.status(201).json(await addAction(pool, user, id, body));
    if ((m === 'PUT' || m === 'DELETE') && id && action_id) return res.status(200).json(await changeAction(pool, user, id, action_id, m, body));
    if (m === 'PUT' && id && section) return res.status(200).json(await updateSection(pool, user, id, section, body));
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (e && e.status && e.missing) return res.status(e.status).json({ error: e.message, missing: e.missing, pending_actions: e.pending_actions });
    return sendError(res, I.dbError(e));
  }
};

// Usado por Pendientes y el Dashboard
module.exports.LISTS = LISTS;
