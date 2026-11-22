// ============================================================
// Pendientes — /api/pending?division=
// Reúne lo que falta en el inventario (regla 8 del diseño), con conteos.
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
  // Modelos: con división, solo los instalados en ella
  const modelScope = division
    ? ` AND EXISTS (SELECT 1 FROM ai_instances i WHERE i.model_id = m.id AND i.status = 'activa'${divI})` : '';

  const sectionUnion = Object.values(I.INSTANCE_SECTIONS).map(s => `
      SELECT i.id AS instance_id, i.code, e.key AS field, e.value AS state, '${s.table}' AS section
      FROM ${s.table} t JOIN ai_instances i ON i.id = t.instance_id, jsonb_each_text(t.field_status) e
      WHERE i.company_id = $1 AND i.status = 'activa'${divI}`).join(' UNION ALL ');

  const q1 = (sql) => db.query(sql + ` LIMIT ${LIMIT}`, p).then(r => r.rows);
  const [fieldFlags, blackBox, assetsUnknown, noAsset, reclass, undetermined, overdue] = await Promise.all([
    q1(`
      SELECT 'modelo' AS entity, m.id, m.code, m.name, e.key AS field, e.value AS state, NULL AS section
      FROM ai_models m, jsonb_each_text(m.field_status) e
      WHERE m.company_id = $1 AND m.status = 'activo'${modelScope}
      UNION ALL
      SELECT 'instancia', i.id, i.code, m.name, e.key, e.value, NULL
      FROM ai_instances i JOIN ai_models m ON m.id = i.model_id, jsonb_each_text(i.field_status) e
      WHERE i.company_id = $1 AND i.status = 'activa'${divI}
      UNION ALL
      SELECT 'instancia', s.instance_id, s.code, NULL, s.field, s.state, s.section FROM (${sectionUnion}) s
      ORDER BY 1, 3`),
    q1(`
      SELECT m.id, m.code, m.name, m.vendor, m.vendor_questionnaire_sent_at, m.vendor_questionnaire_received
      FROM ai_models m WHERE m.company_id = $1 AND m.status = 'activo' AND m.black_box${modelScope} ORDER BY m.name`),
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
      WHERE i.company_id = $1 AND i.status = 'activa' AND i.next_review_date < CURRENT_DATE${divI} ORDER BY i.next_review_date`)
  ]);

  const items = {
    fields_pending: fieldFlags.filter(f => f.state === 'pendiente'),
    fields_not_provided: fieldFlags.filter(f => f.state === 'no_entregado'),
    black_box_models: blackBox,
    questionnaires_unanswered: blackBox.filter(m => !m.vendor_questionnaire_received),
    assets_models_unknown: assetsUnknown,
    instances_without_asset: noAsset,
    reclassification_pending: reclass,
    incidents_model_undetermined: undetermined,
    reviews_overdue: overdue
  };
  const counts = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length]));
  // Total para el número del menú (cada brecha cuenta una vez; los cuestionarios ya están en caja negra)
  counts.total = Object.entries(counts).filter(([k]) => k !== 'questionnaires_unanswered').reduce((s, [, n]) => s + n, 0);
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
