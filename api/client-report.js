// ============================================================
// Intermediario de reportes: valida token y alcance antes de
// llamar al servicio de reportes. Ver docs/roles-y-accesos.md
// ============================================================
const { Pool } = require('pg');
const { verifyClient, assertDivisionInScope, sendError } = require('./_auth');

const REPORT_API_URL = process.env.REPORT_API_URL || 'https://api.biontcorp.com/api/bion';
const FRAMEWORKS = ['ISO42001', 'NIST', 'EUAI'];

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyClient(req); }
  catch (e) { return sendError(res, e); }

  const { branch_id, framework } = req.body || {};
  if (!FRAMEWORKS.includes(framework)) return res.status(400).json({ error: 'Invalid framework' });

  const pool = getClientPool(user.dbName);
  let branchName;
  try {
    // Todos los roles generan reportes, pero solo dentro de su alcance
    await assertDivisionInScope(pool, user, branch_id);
    const r = await pool.query('SELECT name FROM branches WHERE id = $1', [branch_id]);
    branchName = r.rows[0].name;
  } catch (e) { return sendError(res, e); }

  // Los datos de empresa y BD salen del token, nunca del navegador
  const body = {
    cliente:      (user.companyName || '').toLowerCase(),
    database:     user.dbName,
    company_id:   user.companyId,
    branch_id,
    branch_name:  branchName,
    company_name: user.companyName,
    scope:        'division',
    framework
  };

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.REPORT_API_KEY) headers['X-Bion-Key'] = process.env.REPORT_API_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290000);
  try {
    const upstream = await fetch(REPORT_API_URL, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      console.error('report service error', upstream.status, text.slice(0, 500));
      return res.status(502).json({ error: 'Report service error ' + upstream.status });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Report timed out' });
    console.error('client-report error:', err);
    return res.status(502).json({ error: 'Report service unreachable' });
  } finally {
    clearTimeout(timeout);
  }
};
