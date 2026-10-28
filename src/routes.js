'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { q } = require('./db');
const cfg = require('./config');
const { CATEGORIES, TEAMS, campus, DATA_DIR } = cfg;
const auth = require('./auth');
const hub = require('./hub');
const notify = require('./notify');
const svc = require('./service');
const { HttpError, limited } = require('./http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEVELS = ['info', 'drill', 'warning'];
const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
const MAX_MEDIA = 3, MAX_MEDIA_BYTES = 8 * 1024 * 1024;

const str = (v, max, name, required) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, name + ' is required.');
  if (s.length > max) throw new HttpError(400, name + ' is too long (max ' + max + ' characters).');
  return s;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const validLatLng = (lat, lng) => lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const sniffOk = (mime, buf) => {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === 'image/png') return buf.slice(1, 4).toString() === 'PNG';
  if (mime === 'image/gif') return buf.slice(0, 3).toString() === 'GIF';
  if (mime === 'image/webp') return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return true; // videos: trusted by allow-listed type, served with nosniff
};

function resolveUser(token) {
  const p = auth.verify(token);
  if (!p) return null;
  return q.get('SELECT * FROM users WHERE id = ?', p.uid) || null;
}

function register(app) {
  const { add } = app;

  /* ---------- public ---------- */
  add('GET', '/api/health', { auth: false }, () => ({ ok: true, time: Date.now(), streams: hub.count() }));

  add('GET', '/api/config', { auth: false }, () => ({
    name: campus.name,
    campus: { center: campus.center, zoom: campus.zoom, buildings: campus.buildings },
    directory: campus.directory,
    categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v.label, severity: v.severity, teams: v.teams, sensitive: v.sensitive }])),
    teams: TEAMS,
    testMode: cfg.TEST_MODE,
    smsNumber: cfg.SMS_NUMBER,
    demoAccounts: cfg.DEMO_ACCOUNTS ? [
      { label: 'Student', email: 'student@safecampus.test', password: 'student1234' },
      { label: 'Responder (Security)', email: 'security@safecampus.test', password: 'responder1234' },
      { label: 'Responder (Medical)', email: 'medical@safecampus.test', password: 'responder1234' },
      { label: 'Admin', email: cfg.ADMIN_EMAIL, password: cfg.ADMIN_PASSWORD },
    ] : [],
  }));

  /* ---------- auth ---------- */
  add('POST', '/api/auth/register', { auth: false }, ({ body, ip }) => {
    if (limited('reg:' + ip, 10, 3600000)) throw new HttpError(429, 'Too many sign-ups from this device. Try again later.');
    const name = str(body.name, 80, 'Name', true);
    const email = str(body.email, 120, 'Email', true).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (q.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists.');
    const r = q.run('INSERT INTO users (email, name, student_id, phone, role, pass_hash, created_at) VALUES (?,?,?,?,?,?,?)',
      email, name, str(body.studentId, 30, 'Student ID'), str(body.phone, 24, 'Phone'), 'student', auth.hashPassword(password), Date.now());
    const user = q.get('SELECT * FROM users WHERE id = ?', r.id);
    return { token: auth.sign({ uid: user.id }), user: svc.publicUser(user) };
  });

  add('POST', '/api/auth/login', { auth: false }, ({ body, ip }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (limited('login:' + ip + ':' + email, 10, 15 * 60000)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const user = q.get('SELECT * FROM users WHERE email = ?', email);
    if (!user || !auth.checkPassword(String(body.password || ''), user.pass_hash)) throw new HttpError(401, 'Email or password is not correct.');
    return { token: auth.sign({ uid: user.id }), user: svc.publicUser(user) };
  });

  add('GET', '/api/me', (c) => ({
    user: svc.publicUser(c.user),
    contacts: q.all('SELECT id, name, phone FROM contacts WHERE user_id = ? ORDER BY id', c.user.id),
  }));

  add('PUT', '/api/me', ({ user, body }) => {
    q.run('UPDATE users SET name = ?, phone = ?, student_id = ? WHERE id = ?',
      str(body.name, 80, 'Name', true), str(body.phone, 24, 'Phone'), str(body.studentId, 30, 'Student ID'), user.id);
    return { user: svc.publicUser(q.get('SELECT * FROM users WHERE id = ?', user.id)) };
  });

  add('PUT', '/api/me/contacts', ({ user, body }) => {
    const list = Array.isArray(body.contacts) ? body.contacts.slice(0, 5) : [];
    const rows = list.map((c) => ({ name: str(c && c.name, 60, 'Contact name', true), phone: str(c && c.phone, 24, 'Contact phone', true) }));
    q.tx(() => {
      q.run('DELETE FROM contacts WHERE user_id = ?', user.id);
      rows.forEach((r) => q.run('INSERT INTO contacts (user_id, name, phone) VALUES (?,?,?)', user.id, r.name, r.phone));
    });
    return { contacts: q.all('SELECT id, name, phone FROM contacts WHERE user_id = ? ORDER BY id', user.id) };
  });

  add('POST', '/api/me/duty', { roles: ['responder'] }, ({ user, body }) => {
    q.run('UPDATE users SET on_duty = ? WHERE id = ?', body.onDuty ? 1 : 0, user.id);
    publishResponders();
    return { onDuty: !!body.onDuty };
  });

  add('POST', '/api/me/position', { roles: ['responder'] }, ({ user, body }) => {
    const lat = num(body.lat), lng = num(body.lng);
    if (!validLatLng(lat, lng)) throw new HttpError(400, 'Invalid position.');
    if (!user.on_duty) return { ok: true, stored: false };
    q.run('UPDATE users SET lat = ?, lng = ?, pos_at = ? WHERE id = ?', lat, lng, Date.now(), user.id);
    publishResponders();
    return { ok: true, stored: true };
  });

  /* ---------- incidents ---------- */
  add('GET', '/api/incidents', (c) => {
    let rows;
    if (c.user.role === 'student') {
      rows = q.all('SELECT * FROM incidents WHERE reporter_id = ? OR owner_key = ? ORDER BY id DESC LIMIT 200', c.user.id, auth.anonKey(c.user.id));
    } else {
      rows = q.all('SELECT * FROM incidents ORDER BY id DESC LIMIT 500');
    }
    return { incidents: rows.map((r) => svc.serializeIncident(r, c.user, false)) };
  });

  add('POST', '/api/incidents', ({ user, body }) => {
    const category = String(body.category || '');
    const cat = CATEGORIES[category];
    if (!cat) throw new HttpError(400, 'Choose a valid category.');
    const clientId = str(body.clientId, 64, 'clientId');
    if (clientId) {
      const dup = q.get('SELECT * FROM incidents WHERE client_id = ?', clientId);
      if (dup) {
        if (!svc.canView(user, dup)) throw new HttpError(409, 'Duplicate request.');
        return { incident: svc.serializeIncident(dup, user, true), duplicate: true };
      }
    }
    const anonymous = !!body.anonymous;
    if (anonymous && !cat.sensitive) throw new HttpError(400, 'Anonymous reports are only available for harassment and ragging.');
    const isSos = category === 'sos';
    const description = str(body.description, 2000, 'Description') || (isSos ? 'SOS button pressed.' : '');
    const media = Array.isArray(body.media) ? body.media : [];
    if (!description && !media.length) throw new HttpError(400, 'Add a short description or a photo or video.');
    if (media.length > MAX_MEDIA) throw new HttpError(400, 'You can attach up to ' + MAX_MEDIA + ' files.');

    let lat = num(body.lat), lng = num(body.lng);
    let hasLoc = validLatLng(lat, lng);
    if (isSos && !body.shareLocation) hasLoc = false; // no consent, no location
    let live = isSos && hasLoc ? 1 : 0;
    if (!hasLoc) { lat = null; lng = null; }

    let building = '';
    if (body.buildingId) {
      const b = campus.buildings.find((x) => x.id === body.buildingId);
      if (b) building = b.name;
    }
    if (!building && hasLoc) building = svc.nearestBuilding(lat, lng).name;

    const now = Date.now();
    let created = num(body.createdAt) || now;
    if (created > now) created = now;
    if (created < now - 7 * 24 * 3600000) created = now;
    const alias = anonymous ? 'Anon-' + crypto.randomBytes(2).toString('hex').toUpperCase() : null;

    const files = media.map((m) => {
      const mime = String(m && m.type || '');
      if (!MIME_EXT[mime]) throw new HttpError(400, 'Only photos (JPEG, PNG, WebP, GIF) and videos (MP4, WebM, MOV) are allowed.');
      const buf = Buffer.from(String(m.data || ''), 'base64');
      if (!buf.length || buf.length > MAX_MEDIA_BYTES) throw new HttpError(400, 'Each file must be under 8 MB.');
      if (!sniffOk(mime, buf)) throw new HttpError(400, 'A file does not match its type.');
      return { buf, mime, name: str(m.name, 80, 'File name') || 'file', kind: mime.startsWith('video') ? 'video' : 'image' };
    });

    const id = q.tx(() => {
      const r = q.run(`INSERT INTO incidents (client_id, category, severity, status, description, building, room, lat, lng, has_loc, live,
        anonymous, alias, reporter_id, owner_key, source, created_at, reported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      clientId || null, category, cat.severity, 'reported', description, building, str(body.room, 80, 'Room'), lat, lng, hasLoc ? 1 : 0, live,
      anonymous ? 1 : 0, alias, anonymous ? null : user.id, anonymous ? auth.anonKey(user.id) : null, 'app', created, now);
      svc.addHistory(r.id, 'reported', anonymous ? null : user.id);
      files.forEach((f) => {
        const mid = crypto.randomUUID();
        const file = mid + MIME_EXT[f.mime];
        fs.writeFileSync(path.join(DATA_DIR, 'uploads', file), f.buf);
        q.run('INSERT INTO media (id, incident_id, name, mime, kind, file) VALUES (?,?,?,?,?,?)', mid, r.id, f.name, f.mime, f.kind, file);
      });
      return r.id;
    });

    if (isSos) {
      const contacts = q.all('SELECT name, phone FROM contacts WHERE user_id = ?', user.id);
      const where = hasLoc ? 'near ' + building + ' (' + lat.toFixed(5) + ', ' + lng.toFixed(5) + ')' : 'location not shared';
      const text = 'SafeCampus SOS from ' + user.name + (user.student_id ? ' (ID ' + user.student_id + ')' : '') + ', ' + where + ' at ' + new Date(now).toISOString();
      contacts.forEach((c) => notify.send('sos-contact', c.phone, text, id).catch(() => {}));
      notify.send('sos-security', 'security-desk', text, id).catch(() => {});
    }
    publishIncident(id);
    const row = q.get('SELECT * FROM incidents WHERE id = ?', id);
    return { incident: svc.serializeIncident(row, user, true) };
  });

  const getInc = (user, idStr) => {
    const row = q.get('SELECT * FROM incidents WHERE id = ?', Number(idStr));
    // Same answer for "missing" and "not yours" so ids cannot be probed.
    if (!row || !svc.canView(user, row)) throw new HttpError(404, 'Incident not found.');
    return row;
  };

  add('GET', '/api/incidents/:id', ({ user, params }) => ({ incident: svc.serializeIncident(getInc(user, params.id), user, true) }));

  add('POST', '/api/incidents/:id/location', ({ user, params, body }) => {
    const row = getInc(user, params.id);
    if (row.reporter_id !== user.id || !row.live || row.status === 'resolved') return { ok: true, stored: false };
    const lat = num(body.lat), lng = num(body.lng);
    if (!validLatLng(lat, lng)) throw new HttpError(400, 'Invalid position.');
    q.run('UPDATE incidents SET lat = ?, lng = ?, building = ? WHERE id = ?', lat, lng, svc.nearestBuilding(lat, lng).name, row.id);
    publishIncident(row.id, 'location');
    return { ok: true, stored: true };
  });

  add('POST', '/api/incidents/:id/status', { roles: ['responder', 'admin'] }, ({ user, params, body }) => {
    const row = getInc(user, params.id);
    const next = String(body.status || '');
    const i = svc.STATUS_FLOW.indexOf(row.status);
    if (svc.STATUS_FLOW.indexOf(next) !== i + 1 || i < 0) throw new HttpError(409, 'The next step must be ' + (svc.STATUS_FLOW[i + 1] || 'none, this case is already resolved') + '.');
    let assignee = row.assignee_id;
    if (user.role === 'responder') {
      if (!assignee) assignee = user.id;
      else if (assignee !== user.id) throw new HttpError(403, 'This case is assigned to another responder.');
    }
    q.tx(() => {
      q.run('UPDATE incidents SET status = ?, assignee_id = ? WHERE id = ?', next, assignee, row.id);
      svc.addHistory(row.id, next, user.id);
      if (next === 'resolved' && row.live) {
        // Stop sharing: keep only an approximate spot for history.
        q.run('UPDATE incidents SET live = 0, lat = ?, lng = ? WHERE id = ?', Math.round(row.lat * 1000) / 1000, Math.round(row.lng * 1000) / 1000, row.id);
      }
    });
    publishIncident(row.id);
    return { incident: svc.serializeIncident(q.get('SELECT * FROM incidents WHERE id = ?', row.id), user, true) };
  });

  add('POST', '/api/incidents/:id/assign', { roles: ['responder', 'admin'] }, ({ user, params, body }) => {
    const row = getInc(user, params.id);
    if (row.status === 'resolved') throw new HttpError(409, 'This case is resolved.');
    let target = body.responderId === null || body.responderId === undefined ? null : Number(body.responderId);
    if (user.role === 'responder') {
      if (target !== user.id) throw new HttpError(403, 'You can only assign a case to yourself.');
      if (row.assignee_id && row.assignee_id !== user.id) throw new HttpError(403, 'This case is already assigned.');
    }
    if (target !== null) {
      const r = q.get("SELECT id FROM users WHERE id = ? AND role = 'responder'", target);
      if (!r) throw new HttpError(400, 'Choose a valid responder.');
    }
    q.run('UPDATE incidents SET assignee_id = ? WHERE id = ?', target, row.id);
    publishIncident(row.id);
    return { incident: svc.serializeIncident(q.get('SELECT * FROM incidents WHERE id = ?', row.id), user, true) };
  });

  add('POST', '/api/incidents/:id/messages', ({ user, params, body }) => {
    const row = getInc(user, params.id);
    if (row.status === 'resolved') throw new HttpError(409, 'This case is resolved. The chat is closed.');
    const text = str(body.body, 1000, 'Message', true);
    const staff = user.role !== 'student';
    const label = staff ? user.name : (row.anonymous ? row.alias : user.name);
    const r = q.run('INSERT INTO messages (incident_id, sender_role, sender_label, body, at) VALUES (?,?,?,?,?)',
      row.id, staff ? 'responder' : 'reporter', label, text, Date.now());
    const msg = q.get('SELECT id, sender_role AS role, sender_label AS label, body, at FROM messages WHERE id = ?', r.id);
    hub.publish('message', (u) => (svc.canView(u, row) ? { incidentId: row.id, message: msg } : null));
    return { message: msg };
  });

  add('GET', '/api/media/:id', ({ user, params, res }) => {
    const m = q.get('SELECT * FROM media WHERE id = ?', params.id);
    if (!m) throw new HttpError(404, 'Not found.');
    getInc(user, m.incident_id);
    const file = path.join(DATA_DIR, 'uploads', path.basename(m.file));
    if (!fs.existsSync(file)) throw new HttpError(404, 'Not found.');
    res.writeHead(200, { 'Content-Type': m.mime, 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=600', 'Content-Length': fs.statSync(file).size });
    fs.createReadStream(file).pipe(res);
  });

  /* ---------- broadcasts ---------- */
  const audience = () => q.get("SELECT COUNT(*) n FROM users WHERE role IN ('student','responder')").n;
  const sBroadcast = (b, user) => {
    const reads = q.get('SELECT COUNT(*) n FROM broadcast_reads WHERE broadcast_id = ?', b.id).n;
    const mine = q.get('SELECT 1 x FROM broadcast_reads WHERE broadcast_id = ? AND user_id = ?', b.id, user.id);
    return { id: b.id, title: b.title, body: b.body, level: b.level, at: b.at, meRead: !!mine, reads, audience: audience() };
  };

  add('GET', '/api/broadcasts', ({ user }) => ({
    broadcasts: q.all('SELECT * FROM broadcasts ORDER BY id DESC LIMIT 50').map((b) => sBroadcast(b, user)),
  }));

  add('POST', '/api/broadcasts', { roles: ['admin'] }, ({ user, body }) => {
    const level = LEVELS.includes(body.level) ? body.level : 'info';
    const r = q.run('INSERT INTO broadcasts (title, body, level, created_by, at) VALUES (?,?,?,?,?)',
      str(body.title, 120, 'Title', true), str(body.body, 1000, 'Message', true), level, user.id, Date.now());
    const b = q.get('SELECT * FROM broadcasts WHERE id = ?', r.id);
    hub.publish('broadcast', (u) => ({ broadcast: sBroadcast(b, u) }));
    return { broadcast: sBroadcast(b, user) };
  });

  add('POST', '/api/broadcasts/:id/read', ({ user, params }) => {
    const b = q.get('SELECT * FROM broadcasts WHERE id = ?', Number(params.id));
    if (!b) throw new HttpError(404, 'Broadcast not found.');
    q.run('INSERT OR IGNORE INTO broadcast_reads (broadcast_id, user_id, at) VALUES (?,?,?)', b.id, user.id, Date.now());
    hub.publish('broadcast', (u) => (u.role === 'admin' ? { broadcast: sBroadcast(b, u) } : null));
    return { broadcast: sBroadcast(b, user) };
  });

  /* ---------- responders ---------- */
  const sResponder = (r) => ({
    id: r.id, name: r.name, team: r.team, onDuty: !!r.on_duty, lat: r.on_duty ? r.lat : null, lng: r.on_duty ? r.lng : null, email: r.email,
    openCases: q.get("SELECT COUNT(*) n FROM incidents WHERE assignee_id = ? AND status != 'resolved'", r.id).n,
  });
  function publishResponders() {
    const list = q.all("SELECT * FROM users WHERE role = 'responder' ORDER BY id").map(sResponder);
    hub.publish('responders', (u) => (u.role !== 'student' ? { responders: list } : null));
  }

  add('GET', '/api/responders', { roles: ['responder', 'admin'] }, () => ({
    responders: q.all("SELECT * FROM users WHERE role = 'responder' ORDER BY id").map(sResponder),
  }));

  add('POST', '/api/responders', { roles: ['admin'] }, ({ body }) => {
    const email = str(body.email, 120, 'Email', true).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    const team = String(body.team || '');
    if (!TEAMS[team]) throw new HttpError(400, 'Choose a valid team.');
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
    if (q.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists.');
    const r = q.run('INSERT INTO users (email, name, phone, role, pass_hash, team, on_duty, created_at) VALUES (?,?,?,?,?,?,?,?)',
      email, str(body.name, 80, 'Name', true), str(body.phone, 24, 'Phone'), 'responder', auth.hashPassword(password), team, 0, Date.now());
    publishResponders();
    return { responder: sResponder(q.get('SELECT * FROM users WHERE id = ?', r.id)) };
  });

  add('PATCH', '/api/responders/:id', { roles: ['admin'] }, ({ params, body }) => {
    const r = q.get("SELECT * FROM users WHERE id = ? AND role = 'responder'", Number(params.id));
    if (!r) throw new HttpError(404, 'Responder not found.');
    q.run('UPDATE users SET on_duty = ? WHERE id = ?', body.onDuty ? 1 : 0, r.id);
    publishResponders();
    return { responder: sResponder(q.get('SELECT * FROM users WHERE id = ?', r.id)) };
  });

  /* ---------- analytics ---------- */
  add('GET', '/api/analytics', { roles: ['admin'] }, ({ query }) => {
    const days = Math.min(365, Math.max(1, Number(query.get('days')) || 30));
    const since = Date.now() - days * 86400000;
    const rows = q.all(`SELECT i.id, i.category, i.building, i.lat, i.lng, i.has_loc, i.severity, i.status, i.reported_at,
      (SELECT MIN(at) FROM status_history WHERE incident_id = i.id AND status = 'acknowledged') AS ack,
      (SELECT MIN(at) FROM status_history WHERE incident_id = i.id AND status = 'resolved') AS res
      FROM incidents i WHERE i.reported_at >= ?`, since);
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const byCategory = {}, byBuilding = {}, byDay = {};
    rows.forEach((r) => {
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      if (r.building) byBuilding[r.building] = (byBuilding[r.building] || 0) + 1;
      const d = new Date(r.reported_at).toISOString().slice(0, 10);
      byDay[d] = (byDay[d] || 0) + 1;
    });
    return {
      days, total: rows.length,
      open: rows.filter((r) => r.status !== 'resolved').length,
      resolved: rows.filter((r) => r.status === 'resolved').length,
      avgAckMs: avg(rows.filter((r) => r.ack).map((r) => r.ack - r.reported_at)),
      avgResolveMs: avg(rows.filter((r) => r.res).map((r) => r.res - r.reported_at)),
      byCategory, byBuilding, byDay,
      heat: rows.filter((r) => r.has_loc && r.lat !== null).map((r) => ({ lat: r.lat, lng: r.lng, weight: r.severity })),
    };
  });

  /* ---------- live stream ---------- */
  add('GET', '/api/stream', ({ user, res }) => { hub.add(res, user); });

  /* ---------- inbound SMS (offline fallback) ---------- */
  // Format: SC <CATEGORY> [buildingId] [lat,lng] free text...   e.g.  SC MEDICAL cse 23.7806,90.4 student fainted
  add('POST', '/api/sms/inbound', { auth: false }, async ({ req, body }) => {
    if (!cfg.SMS_INBOUND_SECRET || req.headers['x-sms-secret'] !== cfg.SMS_INBOUND_SECRET) throw new HttpError(403, 'Forbidden.');
    const digits = (s) => String(s || '').replace(/\D/g, '');
    const from = digits(body.from);
    const user = from && q.all('SELECT * FROM users WHERE phone IS NOT NULL').find((u) => digits(u.phone) === from);
    if (!user) throw new HttpError(404, 'Phone number is not registered.');
    const parts = String(body.text || '').trim().split(/\s+/);
    if (!/^sc$/i.test(parts[0] || '')) throw new HttpError(400, 'Message must start with SC.');
    const category = String(parts[1] || '').toLowerCase();
    if (!CATEGORIES[category] || CATEGORIES[category].sensitive) throw new HttpError(400, 'Unknown category.');
    let i = 2, building = '', lat = null, lng = null;
    const b = campus.buildings.find((x) => x.id === (parts[i] || '').toLowerCase());
    if (b) { building = b.name; lat = b.lat; lng = b.lng; i++; }
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(parts[i] || '');
    if (m) { lat = Number(m[1]); lng = Number(m[2]); i++; if (!building && validLatLng(lat, lng)) building = svc.nearestBuilding(lat, lng).name; }
    const now = Date.now(), cat = CATEGORIES[category], hasLoc = validLatLng(lat, lng);
    const r = q.run(`INSERT INTO incidents (category, severity, status, description, building, room, lat, lng, has_loc, live, anonymous, reporter_id, source, created_at, reported_at)
      VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?,?,?)`, category, cat.severity, 'reported', parts.slice(i).join(' ').slice(0, 500), building, '', hasLoc ? lat : null, hasLoc ? lng : null, hasLoc ? 1 : 0, user.id, 'sms', now, now);
    svc.addHistory(r.id, 'reported', user.id);
    publishIncident(r.id);
    return { ok: true, ref: svc.ref(r.id) };
  });

  /* ---------- helpers that need hub ---------- */
  function publishIncident(id, kind) {
    const row = q.get('SELECT * FROM incidents WHERE id = ?', id);
    if (!row) return;
    hub.publish('incident', (u) => (svc.canView(u, row) ? { kind: kind || 'update', incident: svc.serializeIncident(row, u, false) } : null));
  }
}

module.exports = { register, resolveUser };
