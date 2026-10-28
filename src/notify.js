'use strict';
const { q } = require('./db');
const { TEST_MODE, SMS_WEBHOOK_URL } = require('./config');

// Sends (or in test mode only records) a message to a phone number.
// In test mode nothing leaves the server, so no real person or emergency service is contacted.
async function send(kind, target, text, incidentId) {
  const now = Date.now();
  let status = 'recorded-test';
  if (!TEST_MODE) {
    if (SMS_WEBHOOK_URL) {
      try {
        const r = await fetch(SMS_WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: target, text }),
        });
        status = r.ok ? 'sent' : 'failed:' + r.status;
      } catch (e) { status = 'failed:network'; }
    } else status = 'not-configured';
  }
  q.run('INSERT INTO notifications (incident_id, kind, target, text, test, status, at) VALUES (?,?,?,?,?,?,?)',
    incidentId, kind, target, text, TEST_MODE ? 1 : 0, status, now);
  if (TEST_MODE) console.log('[test-mode notification]', kind, '->', target, ':', text);
}
module.exports = { send };
