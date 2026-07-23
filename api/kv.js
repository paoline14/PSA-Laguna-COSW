import { kv } from '@vercel/kv';

// Simple key-value bridge for the HR app's storage shim.
// GET    /api/kv?key=foo            -> { key, value } or { key, value: null }
// GET    /api/kv?list=1&prefix=foo  -> { keys: [...], prefix }
// POST   /api/kv   { key, value }   -> { key, value }
// DELETE /api/kv?key=foo            -> { key, deleted: true }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query.list) {
        const prefix = req.query.prefix || '';
        const keys = await kv.keys(`${prefix}*`);
        return res.status(200).json({ keys, prefix });
      }
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: 'key is required' });
      const value = await kv.get(key);
      return res.status(200).json({ key, value: value === undefined ? null : value });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { key, value } = body || {};
      if (!key) return res.status(400).json({ error: 'key is required' });
      await kv.set(key, value);
      return res.status(200).json({ key, value });
    }

    if (req.method === 'DELETE') {
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: 'key is required' });
      await kv.del(key);
      return res.status(200).json({ key, deleted: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
