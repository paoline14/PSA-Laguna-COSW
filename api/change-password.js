import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';
import { getSession } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'You must be signed in.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const currentPassword = (body && body.currentPassword) || '';
    const newPassword = (body && body.newPassword) || '';
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const users = (await kv.get('users-data')) || {};
    const user = users[session.username];
    if (!user) return res.status(401).json({ error: 'Account not found.' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(403).json({ error: 'Current password is incorrect.' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    users[session.username] = user;
    await kv.set('users-data', users);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
