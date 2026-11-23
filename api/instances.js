// ============================================================
// Instancias — /api/instances
//   GET    ?id=                                  ficha completa
//   POST                                         crear { model_id, asset_id? | branch_id, installed_at?, inventory_group? }
//   PUT    ?id=                                  editar campos de uso { ...campos, field_status? }
//   PUT    ?id=&section=<sección>                editar una sección { ...campos, field_status? }
//   POST   ?id=&section=integrations             agregar integración (M7)
//   PUT    ?id=&integration_id=                  editar integración
//   DELETE ?id=&integration_id=                  borrar integración
//   POST   ?id=&action=assign                    asignar activo { asset_id }
//   POST   ?id=&action=review                    riesgo revisado { risk_level? }
//   POST   ?id=&action=retire                    retirar { date? }
//   POST   ?action=copy                          copiar { source_id, target_ids[] } (solo campos vacíos)
// Diseño: docs/activos-y-modelos.md
// ============================================================
const { getClientPool, setCors } = require('./_db');
const { verifyClient, assertCan, assertOwnDivision, pickKnownFields, sendError } = require('./_auth');
const I = require('./_inventory');

const notFound = () => ({ status: 404, message: 'Instance not found' });

// Instancia visible para el usuario (empresa y división)
async function loadInstance(db, user, id) {
  const r = await db.query(`
    SELECT i.*, m.base_risk_level, m.name AS model_name, m.code AS model_code, m.vendor, m.black_box
    FROM ai_instances i JOIN ai_models m ON m.id = i.model_id
    WHERE i.id::text = $1 AND i.company_id = $2`, [String(id), user.companyId]);
  const inst = r.rows[0];
  if (!inst) throw notFound();
  const scope = assertCan(user, 'inventory.view');
  if (scope === 'division' && String(inst.branch_id) !== String(user.divisionId)) throw notFound();
  return inst;
}

function assertActive(inst) {
  if (inst.status !== 'activa') throw I.badRequest('Instance is retired');
}

async function detail(db, user, id) {
  const inst = await loadInstance(db, user, id);
  const sectionRows = await Promise.all(Object.entries(I.INSTANCE_SECTIONS).map(async ([key, s]) => {
    const r = await db.query(`SELECT * FROM ${s.table} WHERE instance_id = $1`, [inst.id]);
    return [key, r.rows[0] || null];
  }));
  const [asset, branch, history, integrations, incidents] = await Promise.all([
    inst.asset_id ? db.query('SELECT id, code, name, manufacturer, equipment_model, status FROM assets WHERE id = $1', [inst.asset_id]) : { rows: [] },
    db.query('SELECT id, name FROM branches WHERE id = $1', [inst.branch_id]),
    db.query(`
      SELECT iv.valid_from, iv.valid_to, v.id AS version_id, v.version, v.change_notes, v.changes_unknown
      FROM instance_versions iv JOIN model_versions v ON v.id = iv.version_id
      WHERE iv.instance_id = $1 ORDER BY iv.valid_from DESC`, [inst.id]),
    db.query('SELECT * FROM inst_integrations WHERE instance_id = $1 ORDER BY created_at', [inst.id]),
    db.query(`
      SELECT x.id, x.occurred_at, x.title, x.kind, x.severity, x.status, v.version
      FROM ai_incidents x LEFT JOIN model_versions v ON v.id = x.version_id
      WHERE x.instance_id = $1 ORDER BY x.occurred_at DESC`, [inst.id])
  ]);
  return {
    instance: inst,
    risk_section: I.RISK_SECTION_BY_GROUP[inst.inventory_group],
    sections: Object.fromEntries(sectionRows),
    asset: asset.rows[0] || null,
    branch: branch.rows[0] || null,
    version_history: history.rows,
    integrations: integrations.rows,
    incidents: incidents.rows
  };
}

async function create(pool, user, body) {
  const scope = assertCan(user, 'instance.write');
  return I.inTransaction(pool, async db => {
    let branchId = body.branch_id;
    if (body.asset_id) {
      const a = await db.query(`SELECT id, branch_id, status, ai_usage FROM assets WHERE id::text = $1 AND company_id = $2`, [String(body.asset_id), user.companyId]);
      if (!a.rows[0]) throw { status: 404, message: 'Asset not found' };
      if (a.rows[0].status !== 'activo') throw I.badRequest('Asset is retired');
      branchId = a.rows[0].branch_id;
      assertOwnDivision(user, scope, branchId);
      const dup = await db.query(`SELECT 1 FROM ai_instances WHERE asset_id = $1 AND model_id::text = $2 AND status = 'activa'`, [a.rows[0].id, String(body.model_id || '')]);
      if (dup.rows[0]) throw I.badRequest('Model already installed on this asset');
      // Con un modelo instalado, el activo pasa a "usa IA"
      if (a.rows[0].ai_usage !== 'usa_ia') await db.query(`UPDATE assets SET ai_usage = 'usa_ia', updated_at = NOW() WHERE id = $1`, [a.rows[0].id]);
    } else {
      await I.assertBranch(db, user.companyId, branchId);
      assertOwnDivision(user, scope, branchId);
    }
    return I.createInstance(db, {
      companyId: user.companyId, modelId: body.model_id, assetId: body.asset_id || null, branchId,
      installedAt: body.installed_at, group: body.inventory_group, userId: user.userId
    });
  });
}

async function updateFields(pool, user, id, body) {
  assertCan(user, 'instance.write');
  const { field_status, ...rest } = body;
  const f = pickKnownFields(rest, I.INSTANCE_FIELDS);
  I.assertGroup(f.inventory_group);
  I.assertOneOf(f.risk_level, I.RISK_LEVELS, 'risk_level');
  if ('inventory_group' in f && f.inventory_group === null) throw I.badRequest('Group required');
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    if ('risk_level' in f) {
      if (!f.risk_level) throw I.badRequest('Risk level required');
      I.assertRiskNotBelow(f.risk_level, inst.base_risk_level);
    }
    const fs = I.mergeFieldStatus(inst.field_status, field_status, I.INSTANCE_FIELDS);
    if (fs !== undefined) f.field_status = JSON.stringify(fs);
    if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
    const keys = Object.keys(f);
    await db.query(
      `UPDATE ai_instances SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [inst.id, ...Object.values(f)]);
    return { success: true };
  });
}

async function updateSection(pool, user, id, sectionKey, body) {
  assertCan(user, 'instance.write');
  const section = I.INSTANCE_SECTIONS[sectionKey];
  if (!section) throw I.badRequest('Invalid section');
  const { field_status, ...rest } = body;
  const f = pickKnownFields(rest, section.fields);
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    const cur = await db.query(`SELECT field_status FROM ${section.table} WHERE instance_id = $1`, [inst.id]);
    const fs = I.mergeFieldStatus(cur.rows[0]?.field_status || {}, field_status, section.fields);
    if (fs !== undefined) f.field_status = JSON.stringify(fs);
    if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
    const keys = Object.keys(f);
    await db.query(
      `INSERT INTO ${section.table} (instance_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => '$' + (i + 2)).join(', ')})
       ON CONFLICT (instance_id) DO UPDATE SET ${keys.map(k => `${k} = EXCLUDED.${k}`).join(', ')}, updated_at = NOW()`,
      [inst.id, ...Object.values(f)]);
    return { success: true };
  });
}

async function integration(pool, user, id, method, integrationId, body) {
  assertCan(user, 'instance.write');
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    if (method === 'POST') {
      const f = pickKnownFields(body, I.INTEGRATION_FIELDS);
      if (!f.integration_name) throw I.badRequest('Integration name required');
      const keys = Object.keys(f);
      const r = await db.query(
        `INSERT INTO inst_integrations (instance_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => '$' + (i + 2)).join(', ')}) RETURNING id`,
        [inst.id, ...Object.values(f)]);
      return { id: r.rows[0].id };
    }
    const own = await db.query('SELECT id FROM inst_integrations WHERE id::text = $1 AND instance_id = $2', [String(integrationId), inst.id]);
    if (!own.rows[0]) throw { status: 404, message: 'Integration not found' };
    if (method === 'DELETE') {
      await db.query('DELETE FROM inst_integrations WHERE id = $1', [own.rows[0].id]);
      return { success: true };
    }
    const f = pickKnownFields(body, I.INTEGRATION_FIELDS);
    if ('integration_name' in f && !f.integration_name) throw I.badRequest('Integration name required');
    if (!Object.keys(f).length) throw I.badRequest('Nothing to update');
    const keys = Object.keys(f);
    await db.query(
      `UPDATE inst_integrations SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [own.rows[0].id, ...Object.values(f)]);
    return { success: true };
  });
}

async function assign(pool, user, id, body) {
  const scope = assertCan(user, 'instance.write');
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    const a = await db.query(`SELECT id, branch_id, status FROM assets WHERE id::text = $1 AND company_id = $2`, [String(body.asset_id || ''), user.companyId]);
    if (!a.rows[0]) throw { status: 404, message: 'Asset not found' };
    if (a.rows[0].status !== 'activo') throw I.badRequest('Asset is retired');
    assertOwnDivision(user, scope, a.rows[0].branch_id);
    await db.query('UPDATE ai_instances SET asset_id = $2, branch_id = $3, updated_at = NOW() WHERE id = $1',
      [inst.id, a.rows[0].id, a.rows[0].branch_id]);
    return { success: true };
  });
}

async function review(pool, user, id, body) {
  assertCan(user, 'instance.write');
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    const risk = body.risk_level || inst.risk_level;
    I.assertOneOf(risk, I.RISK_LEVELS, 'risk_level');
    I.assertRiskNotBelow(risk, inst.base_risk_level);
    await db.query('UPDATE ai_instances SET reclassification_pending = false, risk_level = $2, updated_at = NOW() WHERE id = $1', [inst.id, risk]);
    return { success: true };
  });
}

async function retire(pool, user, id, body) {
  assertCan(user, 'instance.write');
  const when = body.date || I.today();
  I.assertDate(when, 'date');
  return I.inTransaction(pool, async db => {
    const inst = await loadInstance(db, user, id);
    assertActive(inst);
    await db.query(`UPDATE ai_instances SET status = 'retirada', retired_at = $2, updated_at = NOW() WHERE id = $1`, [inst.id, when]);
    await db.query(`UPDATE instance_versions SET valid_to = GREATEST($2::date, valid_from) WHERE instance_id = $1 AND valid_to IS NULL`, [inst.id, when]);
    return { success: true };
  });
}

// Copiar de otra instancia: solo llena campos vacíos (regla 5 del diseño)
async function copy(pool, user, body) {
  assertCan(user, 'instance.write');
  const targets = Array.isArray(body.target_ids) ? [...new Set(body.target_ids.map(String))] : [];
  if (!body.source_id || !targets.length) throw I.badRequest('Source and targets required');
  if (targets.includes(String(body.source_id))) throw I.badRequest('Source cannot be a target');

  return I.inTransaction(pool, async db => {
    const src = await loadInstance(db, user, body.source_id);
    const srcSections = {};
    for (const [key, s] of Object.entries(I.INSTANCE_SECTIONS)) {
      srcSections[key] = (await db.query(`SELECT * FROM ${s.table} WHERE instance_id = $1`, [src.id])).rows[0] || null;
    }
    const srcIntegrations = (await db.query('SELECT * FROM inst_integrations WHERE instance_id = $1', [src.id])).rows;
    const result = [];

    for (const tid of targets) {
      const t = await loadInstance(db, user, tid);
      assertActive(t);
      if (String(t.model_id) !== String(src.model_id)) throw I.badRequest('Instances must be of the same model');
      let filled = 0;

      // Campos de uso: solo los vacíos del destino
      const f = {};
      for (const k of I.INSTANCE_FIELDS) {
        if ((t[k] === null || t[k] === '') && src[k] !== null && src[k] !== '') f[k] = src[k];
      }
      if (Object.keys(f).length) {
        const keys = Object.keys(f);
        await db.query(`UPDATE ai_instances SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
          [t.id, ...Object.values(f)]);
        filled += keys.length;
      }

      // Secciones: crear la fila si no existe; si existe, llenar solo vacíos
      for (const [key, s] of Object.entries(I.INSTANCE_SECTIONS)) {
        const sr = srcSections[key];
        if (!sr) continue;
        const tr = (await db.query(`SELECT * FROM ${s.table} WHERE instance_id = $1`, [t.id])).rows[0];
        const g = {};
        for (const k of s.fields) {
          const empty = !tr || tr[k] === null || tr[k] === '';
          if (empty && sr[k] !== null && sr[k] !== '') g[k] = sr[k];
        }
        const keys = Object.keys(g);
        if (!keys.length) continue;
        if (tr) {
          await db.query(`UPDATE ${s.table} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE instance_id = $1`,
            [t.id, ...Object.values(g)]);
        } else {
          await db.query(`INSERT INTO ${s.table} (instance_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => '$' + (i + 2)).join(', ')})`,
            [t.id, ...Object.values(g)]);
        }
        filled += keys.length;
      }

      // Integraciones: solo si el destino no tiene ninguna
      const hasInt = (await db.query('SELECT 1 FROM inst_integrations WHERE instance_id = $1 LIMIT 1', [t.id])).rows[0];
      if (!hasInt) {
        for (const it of srcIntegrations) {
          const keys = I.INTEGRATION_FIELDS;
          await db.query(`INSERT INTO inst_integrations (instance_id, ${keys.join(', ')}) VALUES ($1, ${keys.map((_, i) => '$' + (i + 2)).join(', ')})`,
            [t.id, ...keys.map(k => it[k])]);
          filled++;
        }
      }
      result.push({ id: t.id, code: t.code, fields_filled: filled });
    }
    return { targets: result };
  });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  let user;
  try { user = verifyClient(req); } catch (e) { return sendError(res, e); }
  const pool = getClientPool(user.dbName);
  const { id, section, action, integration_id } = req.query;
  const body = req.body || {};
  const m = req.method;
  try {
    if (m === 'GET' && id) return res.status(200).json(await detail(pool, user, id));
    if (m === 'POST' && action === 'copy') return res.status(200).json(await copy(pool, user, body));
    if (m === 'POST' && !id) return res.status(201).json(await create(pool, user, body));
    if (id && section === 'integrations' && m === 'POST') return res.status(201).json(await integration(pool, user, id, 'POST', null, body));
    if (id && integration_id && (m === 'PUT' || m === 'DELETE')) return res.status(200).json(await integration(pool, user, id, m, integration_id, body));
    if (m === 'PUT' && id && section) return res.status(200).json(await updateSection(pool, user, id, section, body));
    if (m === 'PUT' && id) return res.status(200).json(await updateFields(pool, user, id, body));
    if (m === 'POST' && id && action === 'assign') return res.status(200).json(await assign(pool, user, id, body));
    if (m === 'POST' && id && action === 'review') return res.status(200).json(await review(pool, user, id, body));
    if (m === 'POST' && id && action === 'retire') return res.status(200).json(await retire(pool, user, id, body));
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return sendError(res, I.dbError(e));
  }
};
