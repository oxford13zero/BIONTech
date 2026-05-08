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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

  const pool = getClientPool(decoded.dbName);

  try {
    const [branchRes, systemRes] = await Promise.all([
      pool.query(
        `SELECT id, name, country FROM branches
         WHERE company_id = $1 AND status = 'active' ORDER BY name`,
        [decoded.companyId]
      ),
      pool.query(
        `SELECT a.id, a.system_code, a.name, a.inventory_group,
                a.risk_level, a.compliance_status, b.name as branch_name
         FROM ai_systems a
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.company_id = $1 AND a.status = 'active' ORDER BY a.name`,
        [decoded.companyId]
      )
    ]);

    const systems = systemRes.rows.map(s => ({
      ...s,
      branches: s.branch_name ? { name: s.branch_name } : null
    }));

    return res.status(200).json({
      branches: branchRes.rows,
      systems
    });
  } catch (err) {
    console.error('client-search error:', err);
    return res.status(500).json({ error: err.message });
  }
};
