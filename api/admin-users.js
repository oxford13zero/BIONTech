const { getMasterPool, getClientPool, verifyAdmin, setCors } = require('./_helpers');
const bcrypt = require('bcryptjs');

// Ver docs/roles-y-accesos.md
const ROLES = ['super_empresa', 'super_division', 'usuario_division'];
const DIVISION_ROLES = ['super_division', 'usuario_division'];

// Pool de la BD del cliente de una empresa.
// Usa las mismas credenciales de Vercel que el resto de la plataforma;
// de la empresa solo se toma el nombre de su base de datos.
async function companyPool(masterPool, companyId) {
  const r = await masterPool.query('SELECT azure_db_name FROM companies WHERE id = $1', [companyId]);
  const c = r.rows[0];
  if (!c || !c.azure_db_name) return null;
  return getClientPool(
    process.env.AZURE_MASTER_DB_HOST, c.azure_db_name,
    process.env.AZURE_MASTER_DB_USER, process.env.AZURE_MASTER_DB_PASSWORD
  );
}

async function listDivisions(masterPool, companyId) {
  const pool = await companyPool(masterPool, companyId);
  if (!pool) return [];
  const r = await pool.query(
    `SELECT id, name FROM branches WHERE company_id = $1 AND status = 'active' ORDER BY name`,
    [companyId]
  );
  return r.rows;
}

// Valida rol + división. Devuelve el division_id final (null para super_empresa)
async function validateRoleDivision(masterPool, companyId, role, divisionId) {
  if (!ROLES.includes(role)) throw { status: 400, message: 'Invalid role' };
  if (!DIVISION_ROLES.includes(role)) return null;
  if (!divisionId) throw { status: 400, message: 'Division is required for this role' };
  const divisions = await listDivisions(masterPool, companyId);
  if (!divisions.some(d => String(d.id) === String(divisionId))) {
    throw { status: 400, message: 'Division does not belong to this company' };
  }
  return divisionId;
}

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

  try {
    // ── GET /api/admin-users?divisions=true&company_id=xxx — divisiones de una empresa
    if (req.method === 'GET' && req.query.divisions === 'true') {
      if (!req.query.company_id) return res.status(400).json({ error: 'company_id required' });
      return res.status(200).json(await listDivisions(pool, req.query.company_id));
    }

    // ── GET /api/admin-users — list all users with company and division name
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

      // Nombre de la división (vive en la BD de cada cliente)
      const divisionNames = {};
      const companyIds = [...new Set(result.rows.filter(r => r.division_id).map(r => r.company_id))];
      await Promise.all(companyIds.map(async cid => {
        try {
          (await listDivisions(pool, cid)).forEach(d => { divisionNames[d.id] = d.name; });
        } catch (e) {
          console.error('division lookup error:', e.message);
        }
      }));

      // Never return password_hash
      const rows = result.rows.map(r => {
        delete r.password_hash;
        r.division_name = r.division_id ? (divisionNames[r.division_id] || null) : null;
        return r;
      });
      return res.status(200).json(rows);
    }

    // ── POST /api/admin-users — create new user
    if (req.method === 'POST') {
      const { company_id, full_name, email, role, password, division_id } = req.body;
      if (!company_id || !full_name || !email || !role || !password) {
        return res.status(400).json({ error: 'All fields required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const divisionId = await validateRoleDivision(pool, company_id, role, division_id);

      // NEVER store plain text — always bcrypt
      const password_hash = await bcrypt.hash(password, 10);

      try {
        const result = await pool.query(`
          INSERT INTO users (company_id, full_name, email, role, division_id, password_hash, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'active')
          RETURNING id
        `, [company_id, full_name, email, role, divisionId, password_hash]);
        return res.status(201).json({ id: result.rows[0].id });
      } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        throw err;
      }
    }

    // ── PUT /api/admin-users?id=xxx — update user
    if (req.method === 'PUT' && id) {
      const { full_name, email, role, status, password, division_id } = req.body;

      const current = (await pool.query('SELECT company_id, role, division_id FROM users WHERE id = $1', [id])).rows[0];
      if (!current) return res.status(404).json({ error: 'User not found' });

      const newRole = role || current.role;
      const divisionId = await validateRoleDivision(
        pool, current.company_id, newRole, division_id !== undefined ? division_id : current.division_id
      );

      let password_hash = null;
      if (password) {
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        password_hash = await bcrypt.hash(password, 10);
      }

      await pool.query(`
        UPDATE users SET
          full_name     = COALESCE($1, full_name),
          email         = COALESCE($2, email),
          role          = $3,
          division_id   = $4,
          status        = COALESCE($5, status),
          password_hash = COALESCE($6, password_hash),
          updated_at    = NOW()
        WHERE id = $7
      `, [full_name, email, newRole, divisionId, status, password_hash, id]);
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

  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('admin-users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
