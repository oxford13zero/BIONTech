const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const USE_AZURE = process.env.DATABASE_PROVIDER === 'azure';

// ── Azure master pool (to look up client DB connection) ───────
let _masterPool = null;
function getMasterPool() {
  if (!_masterPool) {
    _masterPool = new Pool({
      host:     process.env.AZURE_MASTER_DB_HOST,
      port:     5432,
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  if (!USE_AZURE) {
    return res.status(400).json({ error: 'Azure mode not enabled' });
  }

  try {
    const masterPool = getMasterPool();

    // 1. Find user in master DB
    const userResult = await masterPool.query(
      'SELECT u.*, c.name as company_name, c.country, c.azure_db_name, c.id as company_id FROM users u JOIN companies c ON c.id = u.company_id WHERE u.email = $1 AND u.status = $2',
      [email, 'active']
    );

    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // 2. Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // 3. Check client database is ready
    if (!user.azure_db_name) {
      return res.status(503).json({ error: 'Client database not provisioned yet' });
    }

    // 4. Generate JWT
    const token = jwt.sign(
      {
        userId:    user.id,
        email:     user.email,
        role:      user.role,
        branch_id: user.branch_id || null,
        companyId: user.company_id,
        companyName: user.company_name,
        country:   user.country,
        dbName:    user.azure_db_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      token,
      user: {
        id:          user.id,
        email:       user.email,
        role:        user.role,
        branch_id: user.branch_id || null,
        companyId:   user.company_id,
        companyName: user.company_name,
        country:     user.country,
        dbName:      user.azure_db_name
      }
    });

  } catch (err) {
    console.error('Client login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
