import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';
import { setSessionCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const username = ((body && body.username) || '').trim().toLowerCase();
    const password = (body && body.password) || '';
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const users = (await kv.get('users-data')) || {};
    const user = users[username];

    // Same generic error whether the username doesn't exist or the password
    // is wrong, so this endpoint can't be used to enumerate valid usernames.
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    setSessionCookie(res, { username: user.username, role: user.role, employeeId: user.employeeId || null });
    return res.status(200).json({ username: user.username, role: user.role, employeeId: user.employeeId || null });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
