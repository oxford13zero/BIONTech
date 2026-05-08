const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// ── Master DB pool ────────────────────────────────────────────
let _masterPool = null;
function getMasterPool() {
  if (!_masterPool) {
    _masterPool = new Pool({
      host:     process.env.AZURE_MASTER_DB_HOST,
      port:     parseInt(process.env.AZURE_MASTER_DB_PORT || '5432'),
      database: process.env.AZURE_MASTER_DB_NAME,
      user:     process.env.AZURE_MASTER_DB_USER,
      password: process.env.AZURE_MASTER_DB_PASSWORD,
      ssl:      { rejectUnauthorized: false },
      max: 3
    });
  }
  return _masterPool;
}

// ── Client DB pool cache ──────────────────────────────────────
const clientPools = {};
function getClientPool(host, dbName, user, password) {
  const key = `${host}:${dbName}`;
  if (!clientPools[key]) {
    clientPools[key] = new Pool({
      host, port: 5432, database: dbName, user, password,
      ssl: { rejectUnauthorized: false },
      max: 3
    });
  }
  return clientPools[key];
}

// ── JWT verification ──────────────────────────────────────────
function verifyAdmin(req) {
  const auth = req.headers['authorization'];
  if (!auth) throw { status: 401, message: 'No token provided' };
  const token = auth.split(' ')[1];
  if (!token) throw { status: 401, message: 'No token provided' };
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    throw { status: 403, message: 'Invalid or expired token' };
  }
}

// ── CORS headers ──────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { getMasterPool, getClientPool, verifyAdmin, setCors };
