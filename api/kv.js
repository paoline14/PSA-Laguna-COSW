import { kv } from '@vercel/kv';
import { getSession } from './_auth.js';

// Simple key-value bridge for the HR app's storage shim — now with real
// server-side access control instead of trusting whatever the browser says
// about who's logged in.
//
// GET    /api/kv?key=foo            -> { key, value }
// GET    /api/kv?list=1&prefix=foo  -> { keys: [...], prefix }
// POST   /api/kv   { key, value }   -> { key, value }
// DELETE /api/kv?key=foo            -> { key, deleted: true }

// Credentials never travel through this generic endpoint — only through
// /api/login, /api/signup and /api/change-password.
const BLOCKED_KEYS = new Set(['users-data']);

// Only an admin session may write (or delete) these.
const ADMIN_WRITE_KEYS = new Set(['payroll-data', 'employees-data', 'departments-data', 'announcements-data']);

// Readable even by a signed-out visitor — needed to populate the
// department dropdown on the signup form, before any session exists.
const PUBLIC_READ_KEYS = new Set(['departments-data']);

function forbidden(res, msg) {
  return res.status(403).json({ error: msg || 'Forbidden' });
}
function parseValue(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

// What a non-admin gets back for employees-data: their own full record,
// plus enough about colleagues to render avatars, chat, and the office
// birthday/anniversary board (name/department/photo/status/dob/joinDate)
// — but never salary, address, emergency contact, or documents belonging
// to someone else.
function redactEmployeesForSelf(employees, myId) {
  const out = {};
  for (const [id, rec] of Object.entries(employees || {})) {
    out[id] = id === myId
      ? rec
      : { id: rec.id, name: rec.name, department: rec.department, photo: rec.photo, status: rec.status, dob: rec.dob, joinDate: rec.joinDate };
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const session = getSession(req);
    const isAdmin = !!session && session.role === 'admin';

    if (req.method === 'GET') {
      if (req.query.list) {
        if (!session) return res.status(401).json({ error: 'Sign in required.' });
        const prefix = req.query.prefix || '';
        const keys = (await kv.keys(`${prefix}*`)).filter(k => !BLOCKED_KEYS.has(k));
        return res.status(200).json({ keys, prefix });
      }

      const key = req.query.key;
      if (!key) return res.status(400).json({ error: 'key is required' });
      if (BLOCKED_KEYS.has(key)) return forbidden(res, 'This key is not accessible through /api/kv.');
      if (!session && !PUBLIC_READ_KEYS.has(key)) {
        return res.status(401).json({ error: 'Sign in required.' });
      }

      let value = await kv.get(key);
      if (value === undefined) value = null;

      // Data minimization for non-admins: never ship other people's
      // payroll, attendance, or leave records down to the browser, even
      // though the UI wouldn't display them.
      if (session && !isAdmin && value) {
        const myId = session.employeeId;
        if (key === 'employees-data') {
          value = redactEmployeesForSelf(value, myId);
        } else if (key === 'payroll-data') {
          value = myId && value[myId] ? { [myId]: value[myId] } : {};
        } else if (key === 'attendance-data') {
          value = myId && value[myId] ? { [myId]: value[myId] } : {};
        } else if (key === 'leaves-data') {
          value = Array.isArray(value) ? value.filter(l => l.empId === myId) : value;
        }
      }

      return res.status(200).json({ key, value });
    }

    if (req.method === 'POST') {
      if (!session) return res.status(401).json({ error: 'Sign in required.' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { key, value } = body || {};
      if (!key) return res.status(400).json({ error: 'key is required' });
      if (BLOCKED_KEYS.has(key)) return forbidden(res, 'This key is not accessible through /api/kv.');

      if (ADMIN_WRITE_KEYS.has(key) && !isAdmin) {
        return forbidden(res, 'Only an admin can change this data.');
      }

      // Employees may save attendance, but only their own row.
      if (!isAdmin && key === 'attendance-data') {
        const current = (await kv.get('attendance-data')) || {};
        const incoming = parseValue(value) || {};
        const myId = session.employeeId;
        const allIds = new Set([...Object.keys(current), ...Object.keys(incoming)]);
        for (const empId of allIds) {
          if (empId === myId) continue;
          if (JSON.stringify(current[empId] || null) !== JSON.stringify(incoming[empId] || null)) {
            return forbidden(res, 'You can only edit your own attendance.');
          }
        }
      }

      // Employees may save leave requests, but only their own, and they
      // can't approve or reject their own request — only an admin can flip
      // status to Approved/Rejected.
      if (!isAdmin && key === 'leaves-data') {
        const current = (await kv.get('leaves-data')) || [];
        const incoming = parseValue(value) || [];
        const myId = session.employeeId;

        const currentOthers = current.filter(l => l.empId !== myId);
        const incomingOthers = incoming.filter(l => l.empId !== myId);
        if (JSON.stringify(currentOthers) !== JSON.stringify(incomingOthers)) {
          return forbidden(res, 'You can only manage your own leave requests.');
        }

        const currentMineById = Object.fromEntries(current.filter(l => l.empId === myId).map(l => [l.id, l]));
        for (const l of incoming.filter(l => l.empId === myId)) {
          if (l.status === 'Approved' || l.status === 'Rejected') {
            const prior = currentMineById[l.id];
            if (!prior || prior.status !== l.status) {
              return forbidden(res, 'Only an admin can approve or reject leave requests.');
            }
          }
        }
      }

      await kv.set(key, value);
      return res.status(200).json({ key, value });
    }

    if (req.method === 'DELETE') {
      if (!session) return res.status(401).json({ error: 'Sign in required.' });
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: 'key is required' });
      if (BLOCKED_KEYS.has(key)) return forbidden(res, 'This key is not accessible through /api/kv.');
      if (ADMIN_WRITE_KEYS.has(key) && !isAdmin) {
        return forbidden(res, 'Only an admin can delete this data.');
      }
      await kv.del(key);
      return res.status(200).json({ key, deleted: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
