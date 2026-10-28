'use strict';
const crypto = require('crypto');
const { SECRET } = require('./config');

function sign(payload, ttlSec = 7 * 24 * 3600) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verify(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() / 1000 ? p : null;
  } catch (e) { return null; }
}
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return 's1$' + salt.toString('hex') + '$' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [v, saltHex, hashHex] = String(stored).split('$');
  if (v !== 's1' || !saltHex || !hashHex) return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const s = Buffer.from(hashHex, 'hex');
  return h.length === s.length && crypto.timingSafeEqual(h, s);
}
// Stable per-user key used only to let a person find their own anonymous reports.
// It cannot be turned back into a user id without the server secret.
function anonKey(userId) {
  return crypto.createHmac('sha256', SECRET).update('anon:' + userId).digest('hex').slice(0, 32);
}
module.exports = { sign, verify, hashPassword, checkPassword, anonKey };
