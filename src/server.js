'use strict';
const cfg = require('./config');
const { createApp } = require('./http');
const routes = require('./routes');
const { ensureAdmin, seedDemo } = require('./seed');

function create() {
  const app = createApp({ resolveUser: routes.resolveUser });
  routes.register(app);
  ensureAdmin();
  if (cfg.DEMO_ACCOUNTS) seedDemo();
  return app;
}

function start(port = cfg.PORT) {
  const app = create();
  return new Promise((resolve) => {
    app.server.listen(port, () => {
      const addr = app.server.address();
      console.log('PUB SafeCampus running at http://localhost:' + addr.port + (cfg.TEST_MODE ? '  (TEST MODE: no real SMS or calls)' : ''));
      resolve(app.server);
    });
  });
}

if (require.main === module) start();
module.exports = { start, create };
