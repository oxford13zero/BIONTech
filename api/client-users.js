// ============================================================
// Gestión de usuarios por el Super usuario empresa
// Ver docs/roles-y-accesos.md
// ============================================================
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { getMasterPool } = require('./_helpers');
const { ROLES, verifyClient, assertSuperEmpresa, sendError } = require('./_auth');

// Roles que el Super usuario empresa puede crear/gestionar (menores que el suyo)
const MANAGEABLE_ROLES = [ROLES.SUPER_DIVISION, ROLES.USUARIO_DIVISION];

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function listDivisions(clientPool, companyId) {
  const r = await clientPool.query(
    `SELECT id, name FROM branches WHERE company_id = $1 AND status = 'active' ORDER BY name`,
    [companyId]
  );
  return r.rows;
}

function assertRole(role) {
  if (!MANAGEABLE_ROLES.includes(role)) throw { status: 400, message: 'Invalid role' };
}

async function assertDivision(clientPool, companyId, divisionId) {
  if (!divisionId) throw { status: 400, message: 'Division required' };
  const divisions = await listDivisions(clientPool, companyId);
  if (!divisions.some(d => String(d.id) === String(divisionId))) {
    throw { status: 400, message: 'Division does not belong to your company' };
  }
}

// El usuario objetivo es de la misma empresa, no es él mismo y tiene rol gestionable
async function getManageableUser(masterPool, me, userId) {
  if (String(userId) === String(me.userId)) throw { status: 403, message: 'You cannot modify your own account here' };
  const r = await masterPool.query(
    'SELECT id, role, division_id FROM users WHERE id = $1 AND company_id = $2', [userId, me.companyId]
  );
  const u = r.rows[0];
  if (!u) throw { status: 404, message: 'User not found' };
  if (!MANAGEABLE_ROLES.includes(u.role)) throw { status: 403, message: 'You cannot modify this user' };
  return u;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  let me;
  try {
    me = verifyClient(req);
    assertSuperEmpresa(me);
  } catch (e) { return sendError(res, e); }

  const master = getMasterPool();
  const clientPool = getClientPool(me.dbName);
  const { id } = req.query;
  const body = req.body || {};

  try {
    // ── GET /api/client-users — usuarios de mi empresa ────────
    if (req.method === 'GET') {
      const [users, divisions] = await Promise.all([
        master.query(
          `SELECT id, full_name, email, role, division_id, status, created_at
           FROM users WHERE company_id = $1 ORDER BY created_at DESC`,
          [me.companyId]
        ),
        listDivisions(clientPool, me.companyId)
      ]);
      const names = Object.fromEntries(divisions.map(d => [d.id, d.name]));
      return res.status(200).json({
        users: users.rows.map(u => ({
          ...u,
          division_name: u.division_id ? (names[u.division_id] || null) : null,
          manageable: MANAGEABLE_ROLES.includes(u.role) && String(u.id) !== String(me.userId)
        })),
        divisions
      });
    }

    // ── POST /api/client-users — crear usuario ────────────────
    if (req.method === 'POST') {
      const { full_name, email, role, division_id, password } = body;
      if (!full_name || !email || !role || !password) {
        return res.status(400).json({ error: 'All fields required' });
      }
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      assertRole(role);
      await assertDivision(clientPool, me.companyId, division_id);

      const password_hash = await bcrypt.hash(password, 10);
      try {
        const r = await master.query(
          `INSERT INTO users (company_id, full_name, email, role, division_id, password_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
          [me.companyId, full_name, email, role, division_id, password_hash]
        );
        return res.status(201).json({ id: r.rows[0].id });
      } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        throw err;
      }
    }

    // ── PUT /api/client-users?id=xxx — editar usuario ─────────
    if (req.method === 'PUT' && id) {
      const current = await getManageableUser(master, me, id);
      const { full_name, email, role, division_id, password, status } = body;

      const newRole = role || current.role;
      assertRole(newRole);
      const newDivision = division_id !== undefined ? division_id : current.division_id;
      await assertDivision(clientPool, me.companyId, newDivision);
      if (status && !['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

      let password_hash = null;
      if (password) {
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        password_hash = await bcrypt.hash(password, 10);
      }

      try {
        await master.query(
          `UPDATE users SET
             full_name     = COALESCE($1, full_name),
             email         = COALESCE($2, email),
             role          = $3,
             division_id   = $4,
             status        = COALESCE($5, status),
             password_hash = COALESCE($6, password_hash),
             updated_at    = NOW()
           WHERE id = $7 AND company_id = $8`,
          [full_name, email, newRole, newDivision, status, password_hash, id, me.companyId]
        );
      } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
        throw err;
      }
      return res.status(200).json({ success: true });
    }

    // ── DELETE /api/client-users?id=xxx — desactivar ──────────
    if (req.method === 'DELETE' && id) {
      await getManageableUser(master, me, id);
      await master.query(
        `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1 AND company_id = $2`,
        [id, me.companyId]
      );
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    if (err && err.status) return sendError(res, err);
    console.error('client-users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
