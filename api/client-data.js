const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const clientPools = {};

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

function verifyToken(req) {
  const auth = req.headers['authorization'];
  if (!auth) throw { status: 401, message: 'No token' };
  const token = auth.split(' ')[1];
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let decoded;
  try {
    decoded = verifyToken(req);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { type, branch_id } = req.query;
  const pool = getClientPool(decoded.dbName);

  try {
    // ── Branches ─────────────────────────────────────────────
    if (type === 'branches') {
      const result = await pool.query(
        `SELECT id, name, country FROM branches
         WHERE company_id = $1 AND status = 'active' ORDER BY name`,
        [decoded.companyId]
      );
      return res.status(200).json(result.rows);
    }

    // ── AI Systems (with branch join) ─────────────────────────
    if (type === 'ai_systems') {
      let query = `
        SELECT a.*, b.name as branch_name
        FROM ai_systems a
        LEFT JOIN branches b ON b.id = a.branch_id
        WHERE a.company_id = $1 AND a.status = 'active'
        ORDER BY a.inventory_group, a.system_code
      `;
      const params = [decoded.companyId];
      if (branch_id && branch_id !== 'all') {
        query = `
          SELECT a.*, b.name as branch_name
          FROM ai_systems a
          LEFT JOIN branches b ON b.id = a.branch_id
          WHERE a.company_id = $1 AND a.branch_id = $2 AND a.status = 'active'
          ORDER BY a.inventory_group, a.system_code
        `;
        params.push(branch_id);
      }
      const result = await pool.query(query, params);
      // Reshape to match Supabase format (branches as object)
      const rows = result.rows.map(r => ({
        ...r,
        branches: r.branch_name ? { name: r.branch_name } : null
      }));
      return res.status(200).json(rows);
    }

    // ── AI Systems with performance data (for dashboard) ─────
    if (type === 'ai_systems_full') {
      let query = `
        SELECT 
          a.*,
          b.name as branch_name,
          sp.incident_count, sp.bias_evaluated,
          sr.human_override_exists, sr.override_response_time_sec
        FROM ai_systems a
        LEFT JOIN branches b ON b.id = a.branch_id
        LEFT JOIN sec_performance sp ON sp.system_id = a.id
        LEFT JOIN sec_risk_operational sr ON sr.system_id = a.id
        WHERE a.company_id = $1 AND a.status = 'active'
        ORDER BY a.inventory_group
      `;
      const params = [decoded.companyId];
      if (branch_id && branch_id !== 'all') {
        query = `
          SELECT 
            a.*,
            b.name as branch_name,
            sp.incident_count, sp.bias_evaluated,
            sr.human_override_exists, sr.override_response_time_sec
          FROM ai_systems a
          LEFT JOIN branches b ON b.id = a.branch_id
          LEFT JOIN sec_performance sp ON sp.system_id = a.id
          LEFT JOIN sec_risk_operational sr ON sr.system_id = a.id
          WHERE a.company_id = $1 AND a.branch_id = $2 AND a.status = 'active'
          ORDER BY a.inventory_group
        `;
        params.push(branch_id);
      }
      const result = await pool.query(query, params);
      const rows = result.rows.map(r => ({
        ...r,
        branches: r.branch_name ? { name: r.branch_name } : null,
        sec_performance: [{ incident_count: r.incident_count, bias_evaluated: r.bias_evaluated }],
        sec_risk_operational: [{ human_override_exists: r.human_override_exists, override_response_time_sec: r.override_response_time_sec }]
      }));
      return res.status(200).json(rows);
    }

    // ── Legislation alerts ────────────────────────────────────
    if (type === 'alerts') {
      const result = await pool.query(
        `SELECT * FROM legislation_alerts
         WHERE country = $1 AND active = true
         ORDER BY published_at DESC LIMIT 3`,
        [decoded.country || 'Chile']
      );
      return res.status(200).json(result.rows);
    }

    return res.status(400).json({ error: 'Unknown type' });

  } catch (err) {
    console.error('client-data error:', err);
    return res.status(500).json({ error: err.message });
  }
};
