'use strict';
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { DATA_DIR } = require('./config');

const db = new DatabaseSync(path.join(DATA_DIR, 'safecampus.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  student_id TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('student','responder','admin')),
  pass_hash TEXT NOT NULL,
  team TEXT,
  on_duty INTEGER NOT NULL DEFAULT 0,
  lat REAL, lng REAL, pos_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT UNIQUE,
  category TEXT NOT NULL,
  severity INTEGER NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  building TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  has_loc INTEGER NOT NULL DEFAULT 0,
  live INTEGER NOT NULL DEFAULT 0,
  anonymous INTEGER NOT NULL DEFAULT 0,
  alias TEXT,
  reporter_id INTEGER REFERENCES users(id),
  owner_key TEXT,
  assignee_id INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'app',
  created_at INTEGER NOT NULL,
  reported_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inc_reporter ON incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_inc_owner ON incidents(owner_key);
CREATE INDEX IF NOT EXISTS idx_inc_status ON incidents(status);
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  at INTEGER NOT NULL,
  by_user INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  sender_label TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  kind TEXT NOT NULL,
  file TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  level TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS broadcast_reads (
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (broadcast_id, user_id)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  text TEXT NOT NULL,
  test INTEGER NOT NULL,
  status TEXT NOT NULL,
  at INTEGER NOT NULL
);
`);

const clean = (p) => p.map((v) => (v === undefined ? null : v));
const q = {
  get: (sql, ...p) => db.prepare(sql).get(...clean(p)),
  all: (sql, ...p) => db.prepare(sql).all(...clean(p)),
  run: (sql, ...p) => {
    const r = db.prepare(sql).run(...clean(p));
    return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
  },
  tx(fn) {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  },
};
module.exports = { db, q };
