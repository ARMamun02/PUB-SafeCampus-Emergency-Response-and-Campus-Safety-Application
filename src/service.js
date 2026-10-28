'use strict';
const { q } = require('./db');
const { CATEGORIES, TEAMS, campus } = require('./config');
const { anonKey } = require('./auth');

const STATUS_FLOW = ['reported', 'acknowledged', 'enroute', 'resolved'];

function ref(id) { return 'INC-' + (1000 + id); }

function canView(user, row) {
  if (user.role !== 'student') return true;
  if (row.reporter_id && row.reporter_id === user.id) return true;
  return !!(row.owner_key && row.owner_key === anonKey(user.id));
}

function publicUser(u) {
  if (!u) return null;
  const o = { id: u.id, name: u.name, email: u.email, role: u.role, studentId: u.student_id, phone: u.phone };
  if (u.role === 'responder') Object.assign(o, { team: u.team, onDuty: !!u.on_duty });
  return o;
}

function serializeIncident(r, viewer, full) {
  const staff = viewer.role !== 'student';
  const history = q.all('SELECT status, at FROM status_history WHERE incident_id = ? ORDER BY id', r.id)
    .map((h) => ({ status: h.status, at: h.at }));
  const media = q.all('SELECT id, name, kind FROM media WHERE incident_id = ?', r.id)
    .map((m) => ({ id: m.id, name: m.name, kind: m.kind, url: '/api/media/' + m.id }));
  const assignee = r.assignee_id ? q.get('SELECT id, name, team FROM users WHERE id = ?', r.assignee_id) : null;
  let reporter = null;
  if (!r.anonymous && r.reporter_id) {
    const u = q.get('SELECT name, student_id, phone FROM users WHERE id = ?', r.reporter_id);
    if (u) reporter = { name: u.name, studentId: u.student_id, phone: staff ? u.phone : undefined };
  }
  const out = {
    id: r.id, ref: ref(r.id), category: r.category, label: CATEGORIES[r.category] ? CATEGORIES[r.category].label : r.category,
    severity: r.severity, status: r.status, description: r.description, building: r.building, room: r.room,
    hasLoc: !!r.has_loc, lat: r.has_loc ? r.lat : null, lng: r.has_loc ? r.lng : null, live: !!r.live,
    anonymous: !!r.anonymous, alias: r.alias, reporter, source: r.source,
    mine: !!((r.reporter_id && r.reporter_id === viewer.id) || (r.owner_key && r.owner_key === anonKey(viewer.id))),
    createdAt: r.created_at, reportedAt: r.reported_at, history, media,
    teams: (CATEGORIES[r.category] || { teams: [] }).teams,
    assignee: assignee ? { id: assignee.id, name: assignee.name, team: assignee.team } : null,
  };
  if (staff && r.has_loc && r.status !== 'resolved') {
    const n = nearestResponder(r);
    if (n) out.nearest = { id: n.user.id, name: n.user.name, team: n.user.team, meters: Math.round(n.meters / 5) * 5 };
  }
  if (full) {
    out.messages = q.all('SELECT id, sender_role AS role, sender_label AS label, body, at FROM messages WHERE incident_id = ? ORDER BY id', r.id);
  }
  return out;
}

function haversine(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearestResponder(inc) {
  const teams = (CATEGORIES[inc.category] || { teams: [] }).teams;
  const cands = q.all("SELECT id, name, team, lat, lng FROM users WHERE role = 'responder' AND on_duty = 1 AND lat IS NOT NULL");
  let best = null;
  for (const c of cands) {
    if (!teams.includes(c.team)) continue;
    const d = haversine({ lat: inc.lat, lng: inc.lng }, c);
    if (!best || d < best.meters) best = { user: c, meters: d };
  }
  return best;
}

function nearestBuilding(lat, lng) {
  let best = campus.buildings[0], d = Infinity;
  for (const b of campus.buildings) {
    const k = haversine({ lat, lng }, b);
    if (k < d) { d = k; best = b; }
  }
  return best;
}

function addHistory(incidentId, status, byUser) {
  q.run('INSERT INTO status_history (incident_id, status, at, by_user) VALUES (?,?,?,?)', incidentId, status, Date.now(), byUser);
}

module.exports = { STATUS_FLOW, ref, canView, publicUser, serializeIncident, haversine, nearestResponder, nearestBuilding, addHistory, TEAMS };
