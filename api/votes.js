// api/votes.js — Poll votes using MongoDB Atlas
// Environment variable required: MONGODB_URI
// Format: mongodb+srv://username:password@cluster.mongodb.net/gst_training?retryWrites=true&w=majority

const crypto = require('crypto');
const { MongoClient } = require('mongodb');

let cachedClient = null;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }
  return cachedClient.db('gst_training');
}

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
    if (Date.now() - data.ts > 12 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = verifyToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Unauthorised' });

  try {
    const db = await getDb();
    const col = db.collection('votes');

    // GET — fetch votes for a poll
    if (req.method === 'GET') {
      const pollId = req.query.poll;
      if (pollId === undefined) return res.status(400).json({ error: 'poll param required' });
      const doc = await col.findOne({ pollId: String(pollId) });
      return res.status(200).json({ votes: doc ? doc.votes : [] });
    }

    // POST — submit a vote
    if (req.method === 'POST') {
      const { pollId, optionIndex, numOptions } = req.body || {};
      if (pollId === undefined || optionIndex === undefined)
        return res.status(400).json({ error: 'pollId and optionIndex required' });

      const doc = await col.findOne({ pollId: String(pollId) });
      const votes = doc ? doc.votes : Array(numOptions || 4).fill(0);
      votes[optionIndex] = (votes[optionIndex] || 0) + 1;

      await col.updateOne(
        { pollId: String(pollId) },
        { $set: { pollId: String(pollId), votes } },
        { upsert: true }
      );
      return res.status(200).json({ votes });
    }

    // DELETE — reset a poll (admin only)
    if (req.method === 'DELETE') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
      const pollId = req.query.poll;
      await col.updateOne(
        { pollId: String(pollId) },
        { $set: { pollId: String(pollId), votes: [] } },
        { upsert: true }
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('MongoDB error:', err);
    return res.status(500).json({ error: 'Database error: ' + err.message });
  }
};
