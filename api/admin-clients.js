const { getMasterPool, verifyAdmin, setCors } = require('./_helpers');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ── Azure provisioning ────────────────────────────────────────
async function provisionAzureDatabase(companyName) {
  const { ClientSecretCredential } = require('@azure/identity');
  const postgresql = require('@azure/arm-postgresql-flexible');

  console.log('PostgreSQL package exports:', Object.keys(postgresql));

  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID,
    process.env.AZURE_CLIENT_ID,
    process.env.AZURE_CLIENT_SECRET
  );

  const ClientClass = postgresql.PostgreSQLManagementClient
    || postgresql.FlexibleServerManagementClient
    || postgresql.PostgreSQLManagementFlexibleServerManagementClient
    || Object.values(postgresql).find(v => typeof v === 'function');

  console.log('ClientClass found:', ClientClass ? ClientClass.name : 'NOT FOUND');

  if (!ClientClass) {
    throw new Error('Exports available: ' + Object.keys(postgresql).join(', '));
  }

  const azureClient = new ClientClass(credential, process.env.AZURE_SUBSCRIPTION_ID);

  const dbName = 'bion_' + companyName.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/__+/g, '_')
    .substring(0, 40)
    + '_' + Date.now().toString().slice(-4);

  const serverName = process.env.AZURE_MASTER_DB_HOST.replace('.postgres.database.azure.com', '');
  const adminUser  = process.env.AZURE_MASTER_DB_USER;
  const adminPass  = process.env.AZURE_MASTER_DB_PASSWORD;

const dbsApi = azureClient.databases || azureClient.flexibleServers;

  if (!dbsApi) {
    const available = Object.keys(azureClient).filter(k => typeof azureClient[k] === 'object');
    throw new Error('Available client properties: ' + available.join(', '));
  }

  await dbsApi.beginCreateOrUpdateAndWait(
    process.env.AZURE_RESOURCE_GROUP,
    serverName,
    dbName,
    { charset: 'UTF8', collation: 'en_US.utf8' }
  );

  return {
    host:     process.env.AZURE_MASTER_DB_HOST,
    dbName,
    user:     adminUser,
    password: adminPass
  };
}

// ── Run client schema on new database ────────────────────────
async function runClientSchema(host, dbName, user, password) {
  const clientPool = new Pool({
    host, port: 5432, database: dbName, user, password,
    ssl: { rejectUnauthorized: false }
  });

  const schemaPath = path.join(__dirname, '..', 'db', 'client-schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  try {
    await clientPool.query(schema);
  } finally {
    await clientPool.end();
  }
}

// ── Handler ───────────────────────────────────────────────────
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

  // ── GET /api/admin-clients?types=true — inventory types dropdown
  if (req.method === 'GET' && req.query.types === 'true') {
    const result = await pool.query(
      'SELECT id, code, label FROM inventory_types WHERE active = true ORDER BY label'
    );
    return res.status(200).json(result.rows);
  }

  // ── GET /api/admin-clients — list all clients
  if (req.method === 'GET' && !id) {
    const { search, status } = req.query;
    let query = 'SELECT * FROM companies WHERE 1=1';
    const params = [];
    if (search) { params.push(`%${search}%`); query += ` AND name ILIKE $${params.length}`; }
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  }

  // ── GET /api/admin-clients?id=xxx — single client
  if (req.method === 'GET' && id) {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json(result.rows[0]);
  }

  // ── POST /api/admin-clients — create new client + provision Azure DB
  if (req.method === 'POST') {
    const { name, industry, country, contact_name, contact_email, contact_phone, contract_status } = req.body;
    if (!name || !industry) return res.status(400).json({ error: 'Name and industry required' });

    const insertResult = await pool.query(`
      INSERT INTO companies (name, industry, country, contact_name, contact_email, contact_phone, contract_status, status, azure_db_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'provisioning')
      RETURNING id
    `, [name, industry, country || 'Chile', contact_name, contact_email, contact_phone, contract_status || 'pending']);

    const companyId = insertResult.rows[0].id;

    try {
      const { host, dbName, user, password } = await provisionAzureDatabase(name);
      await runClientSchema(host, dbName, user, password);
      await pool.query(`
        UPDATE companies SET
          azure_db_host = $1, azure_db_name = $2, azure_db_user = $3,
          azure_db_password = $4, azure_db_status = 'ready', status = 'active',
          onboarded_at = NOW(), updated_at = NOW()
        WHERE id = $5
      `, [host, dbName, user, password, companyId]);

      return res.status(201).json({
        id: companyId,
        message: 'Client created and database provisioned successfully',
        db_name: dbName
      });
    } catch (azureErr) {
      await pool.query(
        `UPDATE companies SET azure_db_status = 'error', updated_at = NOW() WHERE id = $1`,
        [companyId]
      );
      console.error('Azure provisioning error:', azureErr);
      return res.status(201).json({
        id: companyId,
        warning: 'Client created but database provisioning failed.',
        error: azureErr.message
      });
    }
  }

  // ── PUT /api/admin-clients?id=xxx — update client
  if (req.method === 'PUT' && id) {
    const { name, industry, country, contact_name, contact_email, contact_phone, status, contract_status } = req.body;
    await pool.query(`
      UPDATE companies SET
        name = COALESCE($1, name), industry = COALESCE($2, industry),
        country = COALESCE($3, country), contact_name = COALESCE($4, contact_name),
        contact_email = COALESCE($5, contact_email), contact_phone = COALESCE($6, contact_phone),
        status = COALESCE($7, status), contract_status = COALESCE($8, contract_status),
        updated_at = NOW()
      WHERE id = $9
    `, [name, industry, country, contact_name, contact_email, contact_phone, status, contract_status, id]);
    return res.status(200).json({ success: true });
  }

  // ── DELETE /api/admin-clients?id=xxx — deactivate
  if (req.method === 'DELETE' && id) {
    await pool.query(
      `UPDATE companies SET status = 'inactive', updated_at = NOW() WHERE id = $1`, [id]
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
