// SkySketch server: one Express + socket.io process (websocket only).
// Phone page at /, host (big screen) page at /host, game events per SHARED §4.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { createGame } = require('./game');
const shapes = require('./shapes');
const store = require('./store');
const sf = require('./sf');

function start(opts = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { transports: ['websocket'] });
  const game = createGame(io, opts);

  const FRONTEND = path.join(__dirname, '..', 'frontend');
  app.use('/host', express.static(path.join(FRONTEND, 'host')));
  app.use('/', express.static(path.join(FRONTEND, 'phone')));
  app.get('/health', (_req, res) => res.json({
    ok: true, snowflake: sf.status(), lastScorer: game.stats.lastScorer, rooms: game.rooms.size,
  }));

  const loaded = store.load();
  if (!opts.quiet) console.log(`shapes: ${shapes.library.length} from ${shapes.source}; stored attempts: ${loaded}; snowflake: ${sf.enabled ? 'enabled' : 'off'}`);
  if (sf.enabled) sf.init();

  return new Promise((resolve) => {
    server.listen(opts.port != null ? opts.port : process.env.PORT || 3000, () => {
      const { port } = server.address();
      if (!opts.quiet) console.log(`SkySketch on http://localhost:${port}  (phone: /  host: /host)`);
      resolve({
        port, io, game, server,
        close: () => new Promise((r) => { game.close(); io.close(); server.close(() => r()); }),
      });
    });
  });
}

process.on('unhandledRejection', (e) => console.error('unhandled rejection:', e && (e.stack || e.message || e)));
process.on('uncaughtException', (e) => console.error('uncaught exception:', e && (e.stack || e.message || e)));

if (require.main === module) start();

module.exports = { start };
