import crypto from 'crypto';

// Server-side session handling. The client only ever sees a signed,
// HttpOnly cookie — never the raw role/password data. Every serverless
// function that needs to know "who is this and are they an admin" calls
// getSession(req) and trusts nothing the client sends about itself.

const COOKIE_NAME = 'hr_session';
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly rather than falling back to a guessable default — a weak
    // fallback here would quietly defeat everything else in this file.
    throw new Error(
      'SESSION_SECRET environment variable is not set. Add a long random ' +
      'string for it in your Vercel project (Settings → Environment Variables) and redeploy.'
    );
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

export function signSession(payload) {
  const secret = getSecret();
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_SECONDS * 1000 }));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token) return null;
  let secret;
  try { secret = getSecret(); } catch (e) { return null; }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(body));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload; // { username, role, employeeId }
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

export function getSession(req) {
  const cookies = parseCookies(req);
  return verifySession(cookies[COOKIE_NAME]);
}

export function setSessionCookie(res, payload) {
  const token = signSession(payload);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export { COOKIE_NAME };
