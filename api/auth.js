// api/auth.js — Login endpoint
// Credentials are stored as Vercel Environment Variables:
//   TRAINEE_PASSWORD  (e.g. "gst2026")
//   ADMIN_PASSWORD    (e.g. "admin@nacin")
//   SESSION_SECRET    (any long random string)

const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};

  const TRAINEE_USER = 'officer';
  const ADMIN_USER   = 'admin';
  const TRAINEE_PASS = process.env.TRAINEE_PASSWORD || 'gst2026';
  const ADMIN_PASS   = process.env.ADMIN_PASSWORD   || 'nacin@admin';
  const SECRET       = process.env.SESSION_SECRET   || 'gst-refund-secret-2026';

  let role = null;
  if (username === ADMIN_USER && password === ADMIN_PASS)   role = 'admin';
  if (username === TRAINEE_USER && password === TRAINEE_PASS) role = 'trainee';

  if (!role) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Simple signed token: base64(role + timestamp) + hmac
  const payload = Buffer.from(JSON.stringify({ role, ts: Date.now() })).toString('base64');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
  const token = `${payload}.${sig}`;

  return res.status(200).json({ token, role });
};
