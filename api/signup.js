import { kv } from '@vercel/kv';
import bcrypt from 'bcryptjs';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const username = ((body && body.username) || '').trim().toLowerCase();
    const password = (body && body.password) || '';
    let role = body && body.role === 'admin' ? 'admin' : 'employee';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const users = (await kv.get('users-data')) || {};
    if (users[username]) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    // Only the very first account ever created can become admin. Every
    // signup after that is forced to 'employee' server-side even if the
    // request says role: 'admin' — this is what stops a random visitor
    // from granting themselves admin through the signup form. To add more
    // admins later, do it from an authenticated admin session, not signup.
    const hasAdmin = Object.values(users).some(u => u.role === 'admin');
    if (role === 'admin' && hasAdmin) {
      role = 'employee';
    }

    let employeeId = null;
    if (role === 'employee') {
      const name = ((body && body.name) || '').trim();
      if (!name) return res.status(400).json({ error: 'Full name is required.' });
      const employees = (await kv.get('employees-data')) || {};
      employeeId = 'EMP-' + String(Object.keys(employees).length + 1).padStart(2, '0') + '-' + uid().slice(-3).toUpperCase();
      employees[employeeId] = {
        id: employeeId,
        name,
        designation: ((body && body.designation) || '').trim(),
        department: (body && body.department) || '',
        status: 'Active',
        supervisor: false,
        email: '', phone: '', address: '', dob: '',
        joinDate: new Date().toISOString().slice(0, 10),
        emergency: { name: '', phone: '' },
        salary: { basic: 0, allowances: 0, deductions: 0 },
        leaveBalance: { annual: 15, sick: 15, casual: 7 },
        documents: [], photo: null
      };
      await kv.set('employees-data', employees);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    users[username] = { username, passwordHash, role, employeeId, createdAt: new Date().toISOString() };
    await kv.set('users-data', users);

    return res.status(200).json({ username, role, employeeId });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
