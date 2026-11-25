// ============================================================
// Conexión a la base de datos de cada cliente.
// Usa las credenciales de Vercel; del token solo se toma el nombre de la base.
// ============================================================
const { Pool, types } = require('pg');

// Las fechas (tipo DATE) viajan como texto 'AAAA-MM-DD', sin conversión de zona horaria
types.setTypeParser(1082, v => v);

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

function setCors(res, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { getClientPool, setCors };
