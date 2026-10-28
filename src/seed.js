'use strict';
const { q, db } = require('./db');
const cfg = require('./config');
const auth = require('./auth');
const svc = require('./service');

function ensureAdmin() {
  if (!q.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) {
    q.run('INSERT INTO users (email, name, role, pass_hash, created_at) VALUES (?,?,?,?,?)',
      cfg.ADMIN_EMAIL, 'Security Administrator', 'admin', auth.hashPassword(cfg.ADMIN_PASSWORD), Date.now());
    console.log('Created admin account', cfg.ADMIN_EMAIL);
  }
}

function seedDemo() {
  if (q.get("SELECT id FROM users WHERE email = 'student@safecampus.test'")) return;
  const now = Date.now(), M = 60000;
  const mkUser = (email, name, role, pw, extra = {}) => q.run(
    'INSERT INTO users (email, name, student_id, phone, role, pass_hash, team, on_duty, lat, lng, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    email, name, extra.sid || null, extra.phone || null, role, auth.hashPassword(pw), extra.team || null, extra.duty ? 1 : 0, extra.lat || null, extra.lng || null, now).id;
  // Demo data refers to buildings by their original ids. If campus.json uses different ids,
  // fall back to the building at the same position in the list so the server never fails to start.
  const ORIGINAL_IDS = ['gate', 'admin', 'cafe', 'cse', 'lib', 'acad', 'hostelb', 'med', 'hostelg', 'ground'];
  const list = cfg.campus.buildings;
  const b = (id) => list.find((x) => x.id === id) || list[Math.max(0, ORIGINAL_IDS.indexOf(id)) % list.length];
  const student = mkUser('student@safecampus.test', 'Tasnim Rahman', 'student', 'student1234', { sid: '2201045', phone: 'TEST-0001' });
  q.run('INSERT INTO contacts (user_id, name, phone) VALUES (?,?,?), (?,?,?)', student, 'Amma (mother)', 'TEST-0201', student, 'Nusrat (roommate)', 'TEST-0202');
  const sec = mkUser('security@safecampus.test', 'Karim Hossain', 'responder', 'responder1234', { team: 'security', duty: 1, lat: b('admin').lat, lng: b('admin').lng });
  const med = mkUser('medical@safecampus.test', 'Dr. Salma Akter', 'responder', 'responder1234', { team: 'medical', duty: 1, lat: b('med').lat, lng: b('med').lng });
  mkUser('proctor@safecampus.test', 'Rahat Chowdhury', 'responder', 'responder1234', { team: 'proctor', duty: 1, lat: b('acad').lat, lng: b('acad').lng });
  mkUser('fire@safecampus.test', 'Jamal Uddin', 'responder', 'responder1234', { team: 'fire', duty: 1, lat: b('lib').lat, lng: b('lib').lng });

  const mk = (cat, minsAgo, bid, room, desc, anon, offs, assignee) => {
    const c = cfg.CATEGORIES[cat], bd = b(bid), t0 = now - minsAgo * M;
    const flow = ['reported', 'acknowledged', 'enroute', 'resolved'];
    const status = flow[offs.length];
    const r = q.run(`INSERT INTO incidents (category, severity, status, description, building, room, lat, lng, has_loc, live, anonymous, alias, reporter_id, owner_key, assignee_id, source, created_at, reported_at)
      VALUES (?,?,?,?,?,?,?,?,1,0,?,?,?,?,?,'app',?,?)`, cat, c.severity, status, desc, bd.name, room, bd.lat, bd.lng,
    anon ? 1 : 0, anon ? 'Anon-' + Math.random().toString(16).slice(2, 6).toUpperCase() : null, anon ? null : student, anon ? auth.anonKey(student) : null,
    assignee, t0, t0);
    q.run('INSERT INTO status_history (incident_id, status, at, by_user) VALUES (?,?,?,?)', r.id, 'reported', t0, anon ? null : student);
    offs.forEach((o, i) => q.run('INSERT INTO status_history (incident_id, status, at, by_user) VALUES (?,?,?,?)', r.id, flow[i + 1], t0 + o * M, assignee));
  };
  mk('hazard', 3, 'ground', 'Track', 'Broken glass near the running track.', false, [], null);
  mk('fire', 9, 'cse', 'Lab 3', 'Smoke coming from an overloaded power strip.', false, [1], sec);
  mk('accident', 18, 'gate', '', 'Two bicycles collided at the gate. One rider has a scraped arm.', false, [2, 3], med);
  mk('harassment', 40, 'acad', 'Room 204', 'Repeated unwanted messages and following after class.', true, [5, 8, 22], sec);
  mk('hazard', 60, 'hostelb', 'Level 2 corridor', 'Exposed wiring near the stairwell.', false, [6, 9, 40], sec);
  mk('medical', 95, 'cafe', '', 'A student fainted near the counter.', false, [1, 2, 14], med);
  mk('theft', 190, 'lib', 'Reading hall', 'Laptop bag taken from a table.', false, [2, 4, 25], sec);

  const adminId = q.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1").id;
  const bc = (title, body, level, minsAgo) => q.run('INSERT INTO broadcasts (title, body, level, created_by, at) VALUES (?,?,?,?,?)', title, body, level, adminId, now - minsAgo * M);
  bc('Fire drill, Wednesday 11:00', 'Leave your building by the nearest marked exit and gather at the Playground. Do not use the lifts.', 'drill', 26 * 60);
  bc('Library closes early today', 'The reading hall closes at 5 pm for maintenance.', 'info', 300);
  console.log('Seeded demo accounts and sample incidents.');
}

function reset() {
  ['notifications', 'broadcast_reads', 'broadcasts', 'media', 'messages', 'status_history', 'incidents', 'contacts', 'users']
    .forEach((t) => db.exec('DELETE FROM ' + t));
  db.exec("DELETE FROM sqlite_sequence");
}

module.exports = { ensureAdmin, seedDemo };

if (require.main === module) {
  if (process.argv.includes('--reset')) { reset(); console.log('Database cleared.'); }
  ensureAdmin();
  if (cfg.DEMO_ACCOUNTS) seedDemo();
}
