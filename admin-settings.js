const { getMasterPool, verifyAdmin, setCors } = require('./_helpers');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let admin;
  try {
    admin = verifyAdmin(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  const pool = getMasterPool();
  const { action } = req.query;

  // ── PUT /api/admin-settings?action=password
  if (req.method === 'PUT' && action === 'password') {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both fields required' });
    if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const result = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [admin.adminId]);
    const valid = await bcrypt.compare(current_password, result.rows[0]?.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [hash, admin.adminId]);
    return res.status(200).json({ success: true });
  }

  // ── PUT /api/admin-settings?action=profile
  if (req.method === 'PUT' && action === 'profile') {
    const { full_name, email } = req.body;
    await pool.query(
      'UPDATE admin_users SET full_name = COALESCE($1, full_name), email = COALESCE($2, email) WHERE id = $3',
      [full_name, email, admin.adminId]
    );
    return res.status(200).json({ success: true });
  }

  // ── GET /api/admin-settings?action=inventory — list inventory types
  if (req.method === 'GET' && action === 'inventory') {
    const result = await pool.query('SELECT * FROM inventory_types ORDER BY label');
    return res.status(200).json(result.rows);
  }

  // ── PUT /api/admin-settings?action=inventory&id=xxx — toggle active
  if (req.method === 'PUT' && action === 'inventory') {
    const { id } = req.query;
    await pool.query(
      'UPDATE inventory_types SET active = NOT active WHERE id = $1', [id]
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
