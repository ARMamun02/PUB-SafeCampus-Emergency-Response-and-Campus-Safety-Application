'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

// Minimal .env loader so the project needs no dependencies.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (e) { /* no .env file, defaults apply */ }

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(DATA_DIR, '.secret');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch (e) {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

const campus = JSON.parse(fs.readFileSync(path.join(ROOT, 'campus.json'), 'utf8'));

// Category -> severity (1 low .. 4 critical), teams routed to, sensitivity.
const CATEGORIES = {
  medical:   { label: 'Medical emergency', severity: 4, teams: ['medical', 'security'], sensitive: false },
  fire:      { label: 'Fire',              severity: 4, teams: ['fire', 'security'],    sensitive: false },
  accident:  { label: 'Accident',          severity: 3, teams: ['medical', 'security'], sensitive: false },
  harassment:{ label: 'Harassment',        severity: 3, teams: ['proctor', 'security'], sensitive: true  },
  ragging:   { label: 'Ragging',           severity: 3, teams: ['proctor'],             sensitive: true  },
  theft:     { label: 'Theft',             severity: 2, teams: ['security'],            sensitive: false },
  hazard:    { label: 'Hazard',            severity: 2, teams: ['security'],            sensitive: false },
  sos:       { label: 'SOS alert',         severity: 4, teams: ['security'],            sensitive: false },
};
const TEAMS = { security: 'Security', medical: 'Medical centre', proctor: 'Proctor office', fire: 'Fire service' };

module.exports = {
  ROOT, DATA_DIR, SECRET, campus, CATEGORIES, TEAMS,
  PORT: Number(process.env.PORT) || 3000,
  TEST_MODE: bool(process.env.TEST_MODE, true),
  SMS_NUMBER: process.env.SMS_NUMBER || 'TEST-0100',
  DEMO_ACCOUNTS: bool(process.env.DEMO_ACCOUNTS, true),
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@safecampus.test').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin1234',
  SMS_WEBHOOK_URL: process.env.SMS_WEBHOOK_URL || '',
  SMS_INBOUND_SECRET: process.env.SMS_INBOUND_SECRET || '',
};
