const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

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

function verifyToken(req) {
  const auth = req.headers['authorization'];
  if (!auth) throw { status: 401, message: 'No token' };
  return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let decoded;
  try { decoded = verifyToken(req); }
  catch (e) { return res.status(401).json({ error: 'Invalid token' }); }

  const { role, branch_id: tokenBranchId } = decoded;

  const pool = getClientPool(decoded.dbName);
  const { action } = req.query;
  const body = req.body;

  try {
    // ── Insert branch ─────────────────────────────────────────
    if (action === 'insert_branch') {
      if (role !== 'company_admin') return res.status(403).json({ error: 'Only company admins can create branches' });

      const result = await pool.query(
        `INSERT INTO branches (company_id, name, address, country, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [decoded.companyId, body.name, body.address, body.country || 'Chile']
      );
      return res.status(201).json({ id: result.rows[0].id });
    }

    // ── Insert AI system ──────────────────────────────────────
    if (action === 'insert_system') {
      if (role === 'company_user') return res.status(403).json({ error: 'Read-only access' });
      if (role === 'branch_manager' && String(body.branch_id) !== String(tokenBranchId)) return res.status(403).json({ error: 'You can only add systems to your assigned branch' });

      const result = await pool.query(
        `INSERT INTO ai_systems (
          company_id, branch_id, system_code, name, inventory_group,
          vendor, version, deploy_date, responsible_person, responsible_area,
          operational_location, platform, country, risk_level, compliance_status,
          next_review_date, status, shadow_ai_label
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Sin evaluar',$15,'active','Declarado')
        RETURNING id`,
        [
          decoded.companyId, body.branch_id, body.system_code, body.name,
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
      if (role === 'company_user') return res.status(403).json({ error: 'Read-only access' });
      if (role === 'branch_manager') {
        const check = await pool.query('SELECT branch_id FROM ai_systems WHERE id = $1', [body.system_id]);
        if (String(check.rows[0]?.branch_id) !== String(tokenBranchId)) return res.status(403).json({ error: 'You can only edit systems in your assigned branch' });
      }

      const { system_id, payload } = body;
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await pool.query(
        `UPDATE ai_systems SET ${setClause}, updated_at = NOW() WHERE id = $1`,
        [system_id, ...values]
      );
      return res.status(200).json({ success: true });
    }

    // ── Upsert section ────────────────────────────────────────
    if (action === 'upsert_section') {
      if (role === 'company_user') return res.status(403).json({ error: 'Read-only access' });
      if (role === 'branch_manager') {
        const check = await pool.query('SELECT branch_id FROM ai_systems WHERE id = $1', [body.system_id]);
        if (String(check.rows[0]?.branch_id) !== String(tokenBranchId)) return res.status(403).json({ error: 'You can only edit systems in your assigned branch' });
      }

      const allowedTables = [
        'sec_functional', 'sec_regulatory', 'sec_data_engineering',
        'sec_performance', 'sec_risk_operational', 'sec_risk_decision',
        'sec_risk_strategic', 'sec_risk_human_use', 'sec_compliance_docs',
        'risk_assessments', 'human_supervision','sec_accountability'
      ];
      const { table, system_id, payload } = body;
      if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
      }
      const fullPayload = { system_id, ...payload };
      const keys = Object.keys(fullPayload);
      const values = Object.values(fullPayload);
      const cols = keys.join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const updates = keys.filter(k => k !== 'system_id').map((k, i) => `${k} = EXCLUDED.${k}`).join(', ');
      await pool.query(
        `INSERT INTO ${table} (${cols}) VALUES (${placeholders})
         ON CONFLICT (system_id) DO UPDATE SET ${updates}, updated_at = NOW()`,
        values
      );
      return res.status(200).json({ success: true });
    }

    // ── Delete system ─────────────────────────────────────────
    if (action === 'delete_system') {
      if (role !== 'company_admin') return res.status(403).json({ error: 'Only company admins can delete systems' });

      await pool.query(
        `UPDATE ai_systems SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
        [body.system_id]
      );
      return res.status(200).json({ success: true });
    }

    // ── Update section (edit mode in S5) ──────────────────────
    if (action === 'update_section') {
      if (role === 'company_user') return res.status(403).json({ error: 'Read-only access' });
      if (role === 'branch_manager') {
        const sysId = body.table === 'ai_systems' ? (body.record_id || body.system_id) : body.system_id;
        const check = await pool.query('SELECT branch_id FROM ai_systems WHERE id = $1', [sysId]);
        if (String(check.rows[0]?.branch_id) !== String(tokenBranchId)) return res.status(403).json({ error: 'You can only edit systems in your assigned branch' });
      }

      const allowedTables = [
        'ai_systems', 'sec_functional', 'sec_regulatory', 'sec_data_engineering',
        'sec_performance', 'sec_risk_operational', 'sec_risk_decision',
        'sec_risk_strategic', 'sec_risk_human_use', 'sec_compliance_docs',
        'risk_assessments', 'human_supervision', 'incidents', 'system_integrations','sec_accountability'
      ];
      const { table, record_id, system_id, payload } = body;
      if (!allowedTables.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
      }
      const keys = Object.keys(payload);
      const values = Object.values(payload);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const id = record_id || system_id;
      const idField = table === 'ai_systems' ? 'id' : (record_id && record_id !== 'undefined' && record_id !== 'null' ? 'id' : 'system_id');


      
const updateResult = await pool.query(
        `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE ${idField} = $1`,
        [id, ...values]
      );
      if (updateResult.rowCount === 0 && idField === 'system_id') {
        // No existing row — insert new record
        const insertKeys = [...keys, 'system_id'];
        const insertVals = [...values, system_id];
        const cols = insertKeys.map(k => `"${k}"`).join(', ');
        const placeholders = insertKeys.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(
          `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
          insertVals
        );
      }
      return res.status(200).json({ success: true });


      
      
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('client-write error:', err);
    return res.status(500).json({ error: err.message });
  }
};
