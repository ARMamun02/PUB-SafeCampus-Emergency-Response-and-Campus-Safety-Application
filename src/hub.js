'use strict';
// Server-Sent Events hub. One long-lived response per signed-in browser tab.
const clients = new Set();

function add(res, user) {
  const c = { res, user };
  clients.add(c);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.on('close', () => clients.delete(c));
  return c;
}
// build(user) returns the payload for that viewer, or null to skip them.
function publish(event, build) {
  for (const c of clients) {
    let data;
    try { data = build(c.user); } catch (e) { data = null; }
    if (data == null) continue;
    c.res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
  }
}
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000).unref();
function count() { return clients.size; }
module.exports = { add, publish, count };
