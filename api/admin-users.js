const { getMasterPool, verifyAdmin, setCors } = require('./_helpers');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    verifyAdmin(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const pool = getMasterPool();
  const { id } = req.query;

  // ── GET /api/admin-users — list all users with company name
  if (req.method === 'GET' && !id) {
    const { company_id, role } = req.query;
    let query = `
      SELECT u.*, c.name AS company_name
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      WHERE 1=1
    `;
    const params = [];
    if (company_id) { params.push(company_id); query += ` AND u.company_id = $${params.length}`; }
    if (role)       { params.push(role);       query += ` AND u.role = $${params.length}`; }
    query += ' ORDER BY u.created_at DESC';
    const result = await pool.query(query, params);
    // Never return password_hash
    const rows = result.rows.map(r => { delete r.password_hash; return r; });
    return res.status(200).json(rows);
  }

  // ── POST /api/admin-users — create new user
  if (req.method === 'POST') {
    const { company_id, full_name, email, role, password } = req.body;
    if (!company_id || !full_name || !email || !role || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // NEVER store plain text — always bcrypt
    const password_hash = await bcrypt.hash(password, 10);

    try {
      const result = await pool.query(`
        INSERT INTO users (company_id, full_name, email, role, password_hash, status)
        VALUES ($1, $2, $3, $4, $5, 'active')
        RETURNING id
      `, [company_id, full_name, email, role, password_hash]);
      return res.status(201).json({ id: result.rows[0].id });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      throw err;
    }
  }

  // ── PUT /api/admin-users?id=xxx — update user
  if (req.method === 'PUT' && id) {
    const { full_name, email, role, status, password } = req.body;
    let passwordUpdate = '';
    const params = [full_name, email, role, status, id];

    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const password_hash = await bcrypt.hash(password, 10);
      passwordUpdate = ', password_hash = $6';
      params.splice(4, 0, password_hash); // insert before id
      params[params.length - 1] = id;
    }

    await pool.query(`
      UPDATE users SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        role = COALESCE($3, role),
        status = COALESCE($4, status)
        ${passwordUpdate},
        updated_at = NOW()
      WHERE id = $${params.length}
    `, params);
    return res.status(200).json({ success: true });
  }

  // ── DELETE /api/admin-users?id=xxx — deactivate
  if (req.method === 'DELETE' && id) {
    await pool.query(
      `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1`, [id]
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
