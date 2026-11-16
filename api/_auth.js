// ============================================================
// Permisos de usuarios cliente — ver docs/roles-y-accesos.md
// ============================================================
const jwt = require('jsonwebtoken');

const ROLES = {
  SUPER_EMPRESA:    'super_empresa',
  SUPER_DIVISION:   'super_division',
  USUARIO_DIVISION: 'usuario_division'
};

const EDIT_ROLES = [ROLES.SUPER_EMPRESA, ROLES.SUPER_DIVISION];

// Columnas que nunca se aceptan desde el cliente
const PROTECTED_COLUMNS = ['id', 'company_id', 'system_id', 'created_at', 'updated_at'];

function authError(status, message) {
  return { status, message };
}

// ── Validar token de cliente ──────────────────────────────────
function verifyClient(req) {
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) throw authError(401, 'No token');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    throw authError(401, 'Invalid or expired token');
  }
  if (decoded.type !== 'client') throw authError(401, 'Invalid token type');
  if (!Object.values(ROLES).includes(decoded.role)) throw authError(403, 'Invalid role');
  if (decoded.role !== ROLES.SUPER_EMPRESA && !decoded.divisionId) {
    throw authError(403, 'User has no division assigned');
  }
  return decoded;
}

// División a la que está limitado el usuario (null = toda la empresa)
function divisionScope(user) {
  return user.role === ROLES.SUPER_EMPRESA ? null : user.divisionId;
}

function canEdit(user) {
  return EDIT_ROLES.includes(user.role);
}

function assertCanEdit(user) {
  if (!canEdit(user)) throw authError(403, 'Read-only access');
}

function assertSuperEmpresa(user) {
  if (user.role !== ROLES.SUPER_EMPRESA) throw authError(403, 'Only company super users can do this');
}

// La división pertenece a la empresa y al alcance del usuario
async function assertDivisionInScope(pool, user, divisionId) {
  if (!divisionId) throw authError(400, 'Division required');
  const scope = divisionScope(user);
  if (scope && String(scope) !== String(divisionId)) {
    throw authError(403, 'Division outside your access');
  }
  const r = await pool.query(
    'SELECT id FROM branches WHERE id = $1 AND company_id = $2', [divisionId, user.companyId]
  );
  if (!r.rows[0]) throw authError(404, 'Division not found');
}

// El sistema pertenece a la empresa y al alcance del usuario
async function assertSystemInScope(pool, user, systemId) {
  if (!systemId) throw authError(400, 'system_id required');
  const r = await pool.query(
    'SELECT id, branch_id FROM ai_systems WHERE id = $1 AND company_id = $2', [systemId, user.companyId]
  );
  const sys = r.rows[0];
  if (!sys) throw authError(404, 'System not found');
  const scope = divisionScope(user);
  if (scope && String(scope) !== String(sys.branch_id)) {
    throw authError(403, 'System outside your access');
  }
  return sys;
}

// Nombres de columna seguros (evita inyección SQL en UPDATE/INSERT dinámicos)
function assertSafeColumns(payload, extraBlocked = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw authError(400, 'Invalid payload');
  }
  const blocked = [...PROTECTED_COLUMNS, ...extraBlocked];
  const keys = Object.keys(payload);
  if (keys.length === 0) throw authError(400, 'Empty payload');
  for (const k of keys) {
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(k)) throw authError(400, `Invalid column: ${k}`);
    if (blocked.includes(k)) throw authError(400, `Column not editable: ${k}`);
  }
}

function sendError(res, e) {
  if (e && e.status) return res.status(e.status).json({ error: e.message });
  console.error(e);
  return res.status(500).json({ error: 'Server error' });
}

module.exports = {
  ROLES, verifyClient, divisionScope, canEdit, assertCanEdit, assertSuperEmpresa,
  assertDivisionInScope, assertSystemInScope, assertSafeColumns, sendError
};
