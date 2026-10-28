'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-test-'));
process.env.DEMO_ACCOUNTS = 'true';
process.env.TEST_MODE = 'true';
process.env.SMS_INBOUND_SECRET = 'sekret';

const { start } = require('../src/server');
let base, server;

async function api(method, url, { token, body, headers } = {}) {
  const res = await fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* not json */ }
  return { status: res.status, data };
}
const login = async (email, password) => (await api('POST', '/api/auth/login', { body: { email, password } })).data.token;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

before(async () => { server = await start(0); base = 'http://localhost:' + server.address().port; });
after(() => server.close());

test('auth: register, login, wrong password, rate limit input checks', async () => {
  const bad = await api('POST', '/api/auth/register', { body: { name: 'A', email: 'nope', password: 'short' } });
  assert.equal(bad.status, 400);
  const ok = await api('POST', '/api/auth/register', { body: { name: 'Test Student', email: 'ts@example.com', password: 'password123', studentId: '9' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'student');
  const dup = await api('POST', '/api/auth/register', { body: { name: 'Test Student', email: 'ts@example.com', password: 'password123' } });
  assert.equal(dup.status, 409);
  const wrong = await api('POST', '/api/auth/login', { body: { email: 'ts@example.com', password: 'wrongwrong' } });
  assert.equal(wrong.status, 401);
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('GET', '/api/me', { token: 'garbage' })).status, 401);
});

test('SOS: needs consent for location, is idempotent, notifies contacts in test mode', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const body = { category: 'sos', clientId: 'sos-1', lat: 23.7806, lng: 90.4, shareLocation: false };
  const a = await api('POST', '/api/incidents', { token: t, body });
  assert.equal(a.status, 200);
  assert.equal(a.data.incident.hasLoc, false);
  assert.equal(a.data.incident.lat, null);
  const again = await api('POST', '/api/incidents', { token: t, body });
  assert.equal(again.data.duplicate, true);
  assert.equal(again.data.incident.id, a.data.incident.id);
  const b = await api('POST', '/api/incidents', { token: t, body: { ...body, clientId: 'sos-2', shareLocation: true } });
  assert.equal(b.data.incident.hasLoc, true);
  assert.equal(b.data.incident.live, true);
  const { q } = require('../src/db');
  const n = q.all('SELECT * FROM notifications WHERE incident_id = ?', b.data.incident.id);
  assert.ok(n.length >= 3, 'two contacts plus security desk');
  assert.ok(n.every((x) => x.test === 1 && x.status === 'recorded-test'));
});

test('live location updates only while open, stops and is rounded after resolve', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const sec = await login('security@safecampus.test', 'responder1234');
  const inc = (await api('POST', '/api/incidents', { token: t, body: { category: 'sos', clientId: 'sos-live', lat: 23.78061234, lng: 90.40012345, shareLocation: true } })).data.incident;
  const up = await api('POST', `/api/incidents/${inc.id}/location`, { token: t, body: { lat: 23.7811, lng: 90.4011 } });
  assert.equal(up.data.stored, true);
  for (const s of ['acknowledged', 'enroute', 'resolved']) {
    const r = await api('POST', `/api/incidents/${inc.id}/status`, { token: sec, body: { status: s } });
    assert.equal(r.status, 200, s);
  }
  const after = (await api('GET', `/api/incidents/${inc.id}`, { token: t })).data.incident;
  assert.equal(after.live, false);
  assert.equal(after.lat, 23.781);
  const late = await api('POST', `/api/incidents/${inc.id}/location`, { token: t, body: { lat: 1, lng: 1 } });
  assert.equal(late.data.stored, false);
});

test('status flow must go in order and respects assignment', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const sec = await login('security@safecampus.test', 'responder1234');
  const med = await login('medical@safecampus.test', 'responder1234');
  const inc = (await api('POST', '/api/incidents', { token: t, body: { category: 'theft', description: 'bag', lat: 23.78, lng: 90.4 } })).data.incident;
  assert.equal((await api('POST', `/api/incidents/${inc.id}/status`, { token: sec, body: { status: 'resolved' } })).status, 409);
  assert.equal((await api('POST', `/api/incidents/${inc.id}/status`, { token: t, body: { status: 'acknowledged' } })).status, 403);
  const ack = await api('POST', `/api/incidents/${inc.id}/status`, { token: sec, body: { status: 'acknowledged' } });
  assert.equal(ack.data.incident.status, 'acknowledged');
  assert.equal(ack.data.incident.assignee.name, 'Karim Hossain');
  assert.equal((await api('POST', `/api/incidents/${inc.id}/status`, { token: med, body: { status: 'enroute' } })).status, 403);
  const hist = ack.data.incident.history.map((h) => h.status);
  assert.deepEqual(hist, ['reported', 'acknowledged']);
});

test('privacy: students only see their own incidents', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const other = (await api('POST', '/api/auth/register', { body: { name: 'Other', email: 'other@example.com', password: 'password123' } })).data.token;
  const mine = (await api('POST', '/api/incidents', { token: t, body: { category: 'hazard', description: 'wire', lat: 23.78, lng: 90.4 } })).data.incident;
  assert.equal((await api('GET', `/api/incidents/${mine.id}`, { token: other })).status, 404);
  const list = (await api('GET', '/api/incidents', { token: other })).data.incidents;
  assert.equal(list.length, 0);
  assert.equal((await api('POST', `/api/incidents/${mine.id}/messages`, { token: other, body: { body: 'hi' } })).status, 404);
});

test('anonymous reports hide the reporter from responders and admins but not the owner', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const sec = await login('security@safecampus.test', 'responder1234');
  const admin = await login('admin@safecampus.test', 'admin1234');
  const notAllowed = await api('POST', '/api/incidents', { token: t, body: { category: 'theft', description: 'x', anonymous: true } });
  assert.equal(notAllowed.status, 400);
  const r = await api('POST', '/api/incidents', { token: t, body: { category: 'harassment', description: 'followed me', anonymous: true, lat: 23.78, lng: 90.4 } });
  const inc = r.data.incident;
  assert.equal(inc.anonymous, true);
  assert.match(inc.alias, /^Anon-/);
  assert.equal(inc.reporter, null);
  for (const tok of [sec, admin]) {
    const v = (await api('GET', `/api/incidents/${inc.id}`, { token: tok })).data.incident;
    assert.equal(v.reporter, null);
    assert.ok(!JSON.stringify(v).includes('Tasnim'));
    assert.ok(!JSON.stringify(v).includes('2201045'));
  }
  const { q } = require('../src/db');
  const raw = q.get('SELECT * FROM incidents WHERE id = ?', inc.id);
  assert.equal(raw.reporter_id, null);
  const mine = (await api('GET', '/api/incidents', { token: t })).data.incidents.map((x) => x.id);
  assert.ok(mine.includes(inc.id));
  const msg = await api('POST', `/api/incidents/${inc.id}/messages`, { token: t, body: { body: 'I am near Room 204' } });
  assert.equal(msg.data.message.label, inc.alias);
  const reply = await api('POST', `/api/incidents/${inc.id}/messages`, { token: sec, body: { body: 'Help is coming' } });
  assert.equal(reply.data.message.role, 'responder');
});

test('media upload: validated, served only to people allowed to see the incident', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const other = await login('admin@safecampus.test', 'admin1234');
  const stranger = (await api('POST', '/api/auth/register', { body: { name: 'S', email: 's2@example.com', password: 'password123' } })).data.token;
  const bad = await api('POST', '/api/incidents', { token: t, body: { category: 'hazard', description: 'x', media: [{ name: 'a.exe', type: 'application/x-msdownload', data: 'AAAA' }] } });
  assert.equal(bad.status, 400);
  const fake = await api('POST', '/api/incidents', { token: t, body: { category: 'hazard', description: 'x', media: [{ name: 'a.png', type: 'image/png', data: Buffer.from('not a png').toString('base64') }] } });
  assert.equal(fake.status, 400);
  const ok = await api('POST', '/api/incidents', { token: t, body: { category: 'hazard', description: 'pic', media: [{ name: 'a.png', type: 'image/png', data: PNG }] } });
  assert.equal(ok.status, 200);
  const url = ok.data.incident.media[0].url;
  const get = (tok) => fetch(base + url + '?token=' + tok);
  assert.equal((await get(t)).status, 200);
  assert.equal((await get(other)).status, 200);
  assert.equal((await get(stranger)).status, 404);
});

test('broadcasts: admin only, read confirmation counts', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const admin = await login('admin@safecampus.test', 'admin1234');
  assert.equal((await api('POST', '/api/broadcasts', { token: t, body: { title: 'x', body: 'y' } })).status, 403);
  const b = (await api('POST', '/api/broadcasts', { token: admin, body: { title: 'Fire drill', body: 'Go to the playground', level: 'drill' } })).data.broadcast;
  assert.equal(b.reads, 0);
  const mine = (await api('GET', '/api/broadcasts', { token: t })).data.broadcasts.find((x) => x.id === b.id);
  assert.equal(mine.meRead, false);
  await api('POST', `/api/broadcasts/${b.id}/read`, { token: t });
  await api('POST', `/api/broadcasts/${b.id}/read`, { token: t });
  const after = (await api('GET', '/api/broadcasts', { token: admin })).data.broadcasts.find((x) => x.id === b.id);
  assert.equal(after.reads, 1);
  assert.ok(after.audience >= 5);
});

test('live stream pushes new incidents to responders but not to other students', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const sec = await login('security@safecampus.test', 'responder1234');
  const other = (await api('POST', '/api/auth/register', { body: { name: 'Third', email: 'third@example.com', password: 'password123' } })).data.token;
  async function listen(token) {
    const ctrl = new AbortController();
    const res = await fetch(base + '/api/stream?token=' + token, { signal: ctrl.signal });
    let buf = '';
    (async () => { try { const r = res.body.getReader(); for (;;) { const { value, done } = await r.read(); if (done) break; buf += Buffer.from(value).toString(); } } catch (e) { /* aborted */ } })();
    return { get: () => buf, stop: () => ctrl.abort() };
  }
  const a = await listen(sec), b = await listen(other);
  await new Promise((r) => setTimeout(r, 100));
  await api('POST', '/api/incidents', { token: t, body: { category: 'fire', description: 'smoke', lat: 23.78, lng: 90.4 } });
  await new Promise((r) => setTimeout(r, 300));
  assert.match(a.get(), /event: incident/);
  assert.doesNotMatch(b.get(), /event: incident/);
  a.stop(); b.stop();
});

test('analytics: admin only, with averages and heat points', async () => {
  const t = await login('student@safecampus.test', 'student1234');
  const admin = await login('admin@safecampus.test', 'admin1234');
  assert.equal((await api('GET', '/api/analytics', { token: t })).status, 403);
  const a = (await api('GET', '/api/analytics', { token: admin })).data;
  assert.ok(a.total >= 7);
  assert.ok(a.avgAckMs > 0);
  assert.ok(a.heat.length > 0);
  assert.ok(Object.keys(a.byCategory).length > 2);
});

test('responders: duty and position, nearest responder, admin assign', async () => {
  const admin = await login('admin@safecampus.test', 'admin1234');
  const t = await login('student@safecampus.test', 'student1234');
  const med = await login('medical@safecampus.test', 'responder1234');
  // Place the incident at the medical responder's own position so the test does not depend on campus.json coordinates.
  const medPos = (await api('GET', '/api/responders', { token: admin })).data.responders.find((r) => r.team === 'medical');
  const inc = (await api('POST', '/api/incidents', { token: t, body: { category: 'medical', description: 'faint', lat: medPos.lat, lng: medPos.lng } })).data.incident;
  const view = (await api('GET', `/api/incidents/${inc.id}`, { token: admin })).data.incident;
  assert.equal(view.nearest.team, 'medical');
  assert.ok(view.nearest.meters >= 0);
  const asg = await api('POST', `/api/incidents/${inc.id}/assign`, { token: admin, body: { responderId: view.nearest.id } });
  assert.equal(asg.data.incident.assignee.id, view.nearest.id);
  await api('POST', '/api/me/duty', { token: med, body: { onDuty: false } });
  const list = (await api('GET', '/api/responders', { token: admin })).data.responders.find((r) => r.name.startsWith('Dr.'));
  assert.equal(list.onDuty, false);
  const created = await api('POST', '/api/responders', { token: admin, body: { name: 'New Guard', email: 'guard@example.com', password: 'password123', team: 'security' } });
  assert.equal(created.status, 200);
});

test('inbound SMS fallback creates an incident for a registered phone', async () => {
  assert.equal((await api('POST', '/api/sms/inbound', { body: { from: 'TEST-0001', text: 'SC MEDICAL cse help' } })).status, 403);
  const ok = await api('POST', '/api/sms/inbound', { headers: { 'x-sms-secret': 'sekret' }, body: { from: 'TEST-0001', text: 'SC MEDICAL cse student fainted' } });
  assert.equal(ok.status, 200);
  assert.match(ok.data.ref, /^INC-/);
});

test('static app and security headers are served', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('content-security-policy').includes("default-src 'self'"));
  assert.equal((await fetch(base + '/../src/config.js')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/src/config.js')).status, 404);
});
