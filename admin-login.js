const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const masterPool = new Pool({
  host:     process.env.AZURE_MASTER_DB_HOST,
  port:     parseInt(process.env.AZURE_MASTER_DB_PORT || '5432'),
  database: process.env.AZURE_MASTER_DB_NAME,
  user:     process.env.AZURE_MASTER_DB_USER,
  password: process.env.AZURE_MASTER_DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
  max: 3
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await masterPool.query(
      'SELECT * FROM admin_users WHERE email = $1', [email]
    );
    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      // Log failed attempt
      await masterPool.query(
        'INSERT INTO admin_login_attempts (email, success, attempted_at) VALUES ($1, false, NOW()) ON CONFLICT DO NOTHING',
        [email]
      ).catch(() => {}); // Don't fail if table doesn't exist yet
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await masterPool.query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1', [admin.id]
    );

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, name: admin.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.status(200).json({ token, admin_name: admin.full_name });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
