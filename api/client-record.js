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

async function safeQuery(pool, query, params) {
  try {
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  } catch (e) {
    console.error('safeQuery error:', e.message);
    return null;
  }
}

async function safeQueryMany(pool, query, params) {
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (e) {
    console.error('safeQueryMany error:', e.message);
    return [];
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let decoded;
  try { decoded = verifyToken(req); }
  catch (e) { return res.status(401).json({ error: 'Invalid token' }); }

  const { system_id } = req.query;
  if (!system_id) return res.status(400).json({ error: 'system_id required' });

  const pool = getClientPool(decoded.dbName);

  try {
    const [
      sys, func, reg, dat, perf,
      riskOp, riskDec, riskStr, riskHu,
      comp, riskAss, superv,
      incidents, integrations
    ] = await Promise.all([
      safeQuery(pool, 'SELECT * FROM ai_systems WHERE id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_functional WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_regulatory WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_data_engineering WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_performance WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_risk_operational WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_risk_decision WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_risk_strategic WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_risk_human_use WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM sec_compliance_docs WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM risk_assessments WHERE system_id = $1', [system_id]),
      safeQuery(pool, 'SELECT * FROM human_supervision WHERE system_id = $1', [system_id]),
      safeQueryMany(pool, 'SELECT * FROM incidents WHERE system_id = $1 LIMIT 5', [system_id]),
      safeQueryMany(pool, 'SELECT * FROM system_integrations WHERE system_id = $1 LIMIT 10', [system_id])
    ]);

    if (!sys) return res.status(404).json({ error: 'System not found' });

    return res.status(200).json({
      sys, func, reg, dat, perf,
      riskOp, riskDec, riskStr, riskHu,
      comp, riskAss, superv,
      incidents, integrations
    });
  } catch (err) {
    console.error('client-record error:', err);
    return res.status(500).json({ error: err.message });
  }
};
