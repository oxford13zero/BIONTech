const { Pool } = require('pg');
const { verifyClient, divisionScope, sendError } = require('./_auth');

const clientPools = {};

let _masterPool = null;
function getMasterPool() {
  if (!_masterPool) {
    _masterPool = new Pool({
      host:     process.env.AZURE_MASTER_DB_HOST,
      port:     5432,
      database: process.env.AZURE_MASTER_DB_NAME || 'postgres',
      user:     process.env.AZURE_MASTER_DB_USER,
      password: process.env.AZURE_MASTER_DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      max: 3
    });
  }
  return _masterPool;
}

function getClientPool(dbName) {
  if (!clientPools[dbName]) {
    clientPools[dbName] = new Pool({
      host:     process.env.AZURE_MASTER_DB_HOST,
      port:     5432,
      database: dbName,
      user:     process.env.AZURE_MASTER_DB_USER,
      password: process.env.AZURE_MASTER_DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      max: 3
    });
  }
  return clientPools[dbName];
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyClient(req); }
  catch (e) { return sendError(res, e); }

  const { type } = req.query;
  const scope = divisionScope(user);
  const requested = req.query.branch_id && req.query.branch_id !== 'all' ? req.query.branch_id : null;
  if (scope && requested && String(requested) !== String(scope)) {
    return res.status(403).json({ error: 'Division outside your access' });
  }
  // Roles de división: siempre limitados a su división
  const branchId = scope || requested;
  const pool = getClientPool(user.dbName);

  try {
    // ── Branches ─────────────────────────────────────────────
    if (type === 'branches') {
      const params = [user.companyId];
      let where = `company_id = $1 AND status = 'active'`;
      if (scope) { params.push(scope); where += ` AND id = $2`; }
      const result = await pool.query(
        `SELECT id, name, address, country FROM branches WHERE ${where} ORDER BY name`, params
      );
      return res.status(200).json(result.rows);
    }

    // ── AI Systems ───────────────────────────────────────────
    if (type === 'ai_systems' || type === 'ai_systems_full') {
      const full = type === 'ai_systems_full';
      const params = [user.companyId];
      let where = `a.company_id = $1 AND a.status = 'active'`;
      if (branchId) { params.push(branchId); where += ` AND a.branch_id = $2`; }

      const query = full ? `
        SELECT
          a.*,
          b.name as branch_name,
          sp.incident_count, sp.bias_evaluated,
          sr.human_override_exists, sr.override_response_time_sec
        FROM ai_systems a
        LEFT JOIN branches b ON b.id = a.branch_id
        LEFT JOIN sec_performance sp ON sp.system_id = a.id
        LEFT JOIN sec_risk_operational sr ON sr.system_id = a.id
        WHERE ${where}
        ORDER BY a.inventory_group
      ` : `
        SELECT a.*, b.name as branch_name
        FROM ai_systems a
        LEFT JOIN branches b ON b.id = a.branch_id
        WHERE ${where}
        ORDER BY a.inventory_group, a.system_code
      `;
      const result = await pool.query(query, params);
      const rows = result.rows.map(r => {
        const row = { ...r, branches: r.branch_name ? { name: r.branch_name } : null };
        if (full) {
          row.sec_performance = [{ incident_count: r.incident_count, bias_evaluated: r.bias_evaluated }];
          row.sec_risk_operational = [{ human_override_exists: r.human_override_exists, override_response_time_sec: r.override_response_time_sec }];
        }
        return row;
      });
      return res.status(200).json(rows);
    }

    // ── Legislation alerts ────────────────────────────────────
    if (type === 'alerts') {
      const result = await getMasterPool().query(
        `SELECT * FROM legislation_alerts
         WHERE country = $1 AND active = true
         ORDER BY published_at DESC LIMIT 3`,
        [user.country || 'Chile']
      );
      return res.status(200).json(result.rows);
    }

    return res.status(400).json({ error: 'Unknown type' });

  } catch (err) {
    console.error('client-data error:', err);
    return res.status(500).json({ error: err.message });
  }
};
