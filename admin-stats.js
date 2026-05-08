const { getMasterPool, verifyAdmin, setCors } = require('./_helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    verifyAdmin(req);
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  try {
    const pool = getMasterPool();
    const [companiesRes, usersRes, recentRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')  AS active_clients,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_clients,
          COUNT(*) AS total_clients
        FROM companies
      `),
      pool.query(`SELECT COUNT(*) AS total_users FROM users WHERE status = 'active'`),
      pool.query(`
        SELECT id, name, industry, country, status, contract_status, azure_db_status, created_at
        FROM companies
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

    const stats = companiesRes.rows[0];
    return res.status(200).json({
      total_clients:   parseInt(stats.total_clients),
      active_clients:  parseInt(stats.active_clients),
      pending_clients: parseInt(stats.pending_clients),
      total_users:     parseInt(usersRes.rows[0].total_users),
      recent_clients:  recentRes.rows
    });
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
