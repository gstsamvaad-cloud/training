// api/votes.js — Poll votes endpoint
// Uses Vercel KV (Redis) for real-time vote storage.
// Set up: vercel env add KV_REST_API_URL and KV_REST_API_TOKEN in your Vercel dashboard.

const crypto = require('crypto');

// Verify token helper
function verifyToken(authHeader) {
  const SECRET = process.env.SESSION_SECRET || 'gst-refund-secret-2026';
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    // Token valid for 12 hours
    if (Date.now() - data.ts > 12 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

// Simple KV wrapper using Vercel KV REST API
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${key}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` } });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : null;
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${key}`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value))
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  // GET /api/votes?poll=0  — fetch vote counts for a poll
  if (req.method === 'GET') {
    const pollId = req.query.poll;
    if (pollId === undefined) return res.status(400).json({ error: 'poll param required' });
    const votes = await kvGet(`poll:${pollId}`) || [];
    return res.status(200).json({ votes });
  }

  // POST /api/votes  — submit a vote { pollId, optionIndex }
  if (req.method === 'POST') {
    const { pollId, optionIndex, numOptions } = req.body || {};
    if (pollId === undefined || optionIndex === undefined) return res.status(400).json({ error: 'pollId and optionIndex required' });
    const votes = await kvGet(`poll:${pollId}`) || Array(numOptions || 4).fill(0);
    votes[optionIndex] = (votes[optionIndex] || 0) + 1;
    await kvSet(`poll:${pollId}`, votes);
    return res.status(200).json({ votes });
  }

  // DELETE /api/votes?poll=0  — reset a poll (admin only)
  if (req.method === 'DELETE') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const pollId = req.query.poll;
    await kvSet(`poll:${pollId}`, []);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

