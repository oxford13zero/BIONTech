const { Pool } = require('pg');
const {
  ROLES, verifyClient, assertCanEdit, assertSuperEmpresa,
  assertDivisionInScope, assertSystemInScope, assertSafeColumns, sendError
} = require('./_auth');

const clientPools = {};
function getClientPool(dbName) {
  if (!clientPools[dbName]) {
    clientPools[dbName] = new Pool({
      host: process.env.AZURE_MASTER_DB_HOST, port: 5432,
      database: dbName,
      user: process.env.AZURE_MASTER_DB_USER,
      password: process.env.AZURE_MASTER_DB_PASSWORD,
      ssl: { rejectUnauthorized: false }, max: 3
    });
  }
  return clientPools[dbName];
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Tablas de secciones (una fila por sistema)
const SECTION_TABLES = [
  'sec_functional', 'sec_regulatory', 'sec_data_engineering',
  'sec_performance', 'sec_risk_operational', 'sec_risk_decision',
  'sec_risk_strategic', 'sec_risk_human_use', 'sec_compliance_docs',
  'risk_assessments', 'human_supervision', 'sec_accountability'
];
// Tablas editables en la ficha (S5)
const EDITABLE_TABLES = ['ai_systems', ...SECTION_TABLES, 'incidents', 'system_integrations'];

const isSet = v => v && v !== 'undefined' && v !== 'null';

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = verifyClient(req); }
  catch (e) { return sendError(res, e); }

  const pool = getClientPool(user.dbName);
  const { action } = req.query;
  const body = req.body || {};

  try {
    // ── Insert division (branch) ──────────────────────────────
    if (action === 'insert_branch') {
      assertSuperEmpresa(user);
      if (!body.name) return res.status(400).json({ error: 'Name required' });
      const result = await pool.query(
        `INSERT INTO branches (company_id, name, address, country, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [user.companyId, body.name, body.address, body.country || 'Chile']
      );
      return res.status(201).json({ id: result.rows[0].id });
    }

    // ── Insert AI system ──────────────────────────────────────
    if (action === 'insert_system') {
      assertCanEdit(user);
      await assertDivisionInScope(pool, user, body.branch_id);

      const result = await pool.query(
        `INSERT INTO ai_systems (
          company_id, branch_id, system_code, name, inventory_group,
          vendor, version, deploy_date, responsible_person, responsible_area,
          operational_location, platform, country, risk_level, compliance_status,
          next_review_date, status, shadow_ai_label
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Sin evaluar',$15,'active','Declarado')
        RETURNING id`,
        [
          user.companyId, body.branch_id, body.system_code, body.name,
          body.inventory_group, body.vendor, body.version, body.deploy_date,
          body.responsible_person, body.responsible_area, body.operational_location,
          body.platform, body.country || 'Chile', body.risk_level,
          body.next_review_date
        ]
      );
      return res.status(201).json({ id: result.rows[0].id });
    }

    // ── Update AI system ──────────────────────────────────────
    if (action === 'update_system') {
      assertCanEdit(user);
      const { system_id, payload } = body;
      await assertSystemInScope(pool, user, system_id);
      // Solo super_empresa puede mover un sistema a otra división
      assertSafeColumns(payload, user.role === ROLES.SUPER_EMPRESA ? ['status'] : ['status', 'branch_id']);
      if (payload.branch_id) await assertDivisionInScope(pool, user, payload.branch_id);

      const keys = Object.keys(payload);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await pool.query(
        `UPDATE ai_systems SET ${setClause}, updated_at = NOW() WHERE id = $1`,
        [system_id, ...Object.values(payload)]
      );
      return res.status(200).json({ success: true });
    }

    // ── Upsert section ────────────────────────────────────────
    if (action === 'upsert_section') {
      assertCanEdit(user);
      const { table, system_id, payload } = body;
      if (!SECTION_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });
      await assertSystemInScope(pool, user, system_id);
      assertSafeColumns(payload);

      const fullPayload = { system_id, ...payload };
      const keys = Object.keys(fullPayload);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const updates = Object.keys(payload).map(k => `${k} = EXCLUDED.${k}`).join(', ');
      await pool.query(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders})
         ON CONFLICT (system_id) DO UPDATE SET ${updates}, updated_at = NOW()`,
        Object.values(fullPayload)
      );
      return res.status(200).json({ success: true });
    }

    // ── Delete system (logical) ───────────────────────────────
    if (action === 'delete_system') {
      assertCanEdit(user);
      await assertSystemInScope(pool, user, body.system_id);
      await pool.query(
        `UPDATE ai_systems SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
        [body.system_id]
      );
      return res.status(200).json({ success: true });
    }

    // ── Update section (edit mode in S5) ──────────────────────
    if (action === 'update_section') {
      assertCanEdit(user);
      const { table, record_id, system_id, payload } = body;
      if (!EDITABLE_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid table' });

      const sysId = table === 'ai_systems' ? (isSet(record_id) ? record_id : system_id) : system_id;
      await assertSystemInScope(pool, user, sysId);
      assertSafeColumns(payload, table === 'ai_systems' ? ['status', 'branch_id'] : []);

      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

      if (table === 'ai_systems') {
        await pool.query(
          `UPDATE ai_systems SET ${setClause}, updated_at = NOW() WHERE id = $1`,
          [sysId, ...values]
        );
      } else if (isSet(record_id)) {
        // El registro debe pertenecer al sistema autorizado
        await pool.query(
          `UPDATE ${table} SET ${setClause}, updated_at = NOW()
           WHERE id = $1 AND system_id = $${keys.length + 2}`,
          [record_id, ...values, sysId]
        );
      } else {
        const updateResult = await pool.query(
          `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE system_id = $1`,
          [sysId, ...values]
        );
        if (updateResult.rowCount === 0) {
          // No existe la fila — crearla
          const insertKeys = [...keys, 'system_id'];
          const cols = insertKeys.map(k => `"${k}"`).join(', ');
          const placeholders = insertKeys.map((_, i) => `$${i + 1}`).join(', ');
          await pool.query(
            `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
            [...values, sysId]
          );
        }
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    if (err && err.status) return sendError(res, err);
    console.error('client-write error:', err);
    return res.status(500).json({ error: err.message });
  }
};
