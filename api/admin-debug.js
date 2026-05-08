const { getMasterPool, setCors } = require('./_helpers');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const pool = getMasterPool();
    const result = await pool.query(
      'SELECT email, password_hash FROM admin_users WHERE email = $1',
      ['lester.lino@proton.me']
    );

    const user = result.rows[0];
    if (!user) return res.json({ error: 'User not found' });

    const testPassword = req.query.p || '';
    const match = await bcrypt.compare(testPassword, user.password_hash);

    return res.json({
      user_found: true,
      hash_prefix: user.password_hash.substring(0, 7),
      password_tested: testPassword ? 'yes' : 'no',
      bcrypt_match: match
    });
  } catch (err) {
    return res.json({ error: err.message });
  }
};
