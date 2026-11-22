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

// ============================================================
// Tabla de permisos — activos, modelos e instancias
// Ver docs/activos-y-modelos.md, sección 6.
// Valor por rol: 'company' = toda la empresa, 'division' = solo su división.
// Si un rol no aparece en una acción, no puede hacerla.
// ============================================================
const PERMISSIONS = {
  'inventory.view':  { super_empresa: 'company', super_division: 'division', usuario_division: 'division' },
  'asset.write':     { super_empresa: 'company', super_division: 'division' },
  'instance.write':  { super_empresa: 'company', super_division: 'division' },
  'model.write':     { super_empresa: 'company' },                                                          // catálogo y riesgo base
  'version.write':   { super_empresa: 'company' },                                                          // registrar versiones en el catálogo
  'version.apply':   { super_empresa: 'company', super_division: 'division' },                              // aplicar una versión ya registrada
  'incident.create': { super_empresa: 'company', super_division: 'division', usuario_division: 'division' },  // registrar
  'incident.write':  { super_empresa: 'company', super_division: 'division' },                              // editar y cerrar
  'report.generate': { super_empresa: 'company', super_division: 'division', usuario_division: 'division' }
};

// Alcance de un rol para una acción: 'company', 'division' o null (no permitido)
function can(user, action) {
  const rule = PERMISSIONS[action];
  if (!rule) throw new Error('Unknown permission: ' + action);
  return rule[user.role] || null;
}

function assertCan(user, action) {
  const scope = can(user, action);
  if (!scope) throw authError(403, 'Not allowed');
  return scope;
}

// Permisos del rol para enviarlos a la pantalla (misma tabla que usa el servidor)
function permissionsFor(role) {
  return Object.fromEntries(Object.keys(PERMISSIONS).map(a => [a, PERMISSIONS[a][role] || null]));
}

// División efectiva de una consulta (selector de división de la pantalla).
// - super_empresa: la pedida, o null = todas las divisiones
// - otros roles: siempre la suya; pedir otra es 403
// Roles de división: la división pedida debe ser la propia
function assertOwnDivision(user, scope, branchId) {
  if (scope === 'division' && String(branchId) !== String(user.divisionId)) throw authError(403, 'Division outside your access');
}

async function resolveDivision(pool, user, requested) {
  const wanted = requested && requested !== 'all' ? String(requested) : null;
  if (user.role !== ROLES.SUPER_EMPRESA) {
    if (wanted && wanted !== String(user.divisionId)) throw authError(403, 'Division outside your access');
    return String(user.divisionId);
  }
  if (!wanted) return null;
  const r = await pool.query('SELECT id FROM branches WHERE id::text = $1 AND company_id = $2', [wanted, user.companyId]);
  if (!r.rows[0]) throw authError(404, 'Division not found');
  return wanted;
}

// Acepta solo campos conocidos (lista fija por tabla). Devuelve un objeto limpio.
function pickKnownFields(payload, allowed) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw authError(400, 'Invalid payload');
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!allowed.includes(k)) throw authError(400, `Field not allowed: ${k}`);
    out[k] = v === '' ? null : v;
  }
  return out;
}

module.exports = {
  ROLES, verifyClient, divisionScope, canEdit, assertCanEdit, assertSuperEmpresa,
  assertDivisionInScope, assertSystemInScope, assertSafeColumns, sendError,
  PERMISSIONS, can, assertCan, assertOwnDivision, permissionsFor, resolveDivision, pickKnownFields
};
