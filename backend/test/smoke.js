// Smoke test: start the server, create a room, join two phones, start, check round:start.
// Run: npm run smoke
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT },
  stdio: ['ignore', 'pipe', 'inherit'],
});

function fail(msg) {
  console.error('FAIL:', msg);
  srv.kill();
  process.exit(1);
}
const timer = setTimeout(() => fail('timed out'), 8000);
const call = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));

srv.stdout.once('data', async () => {
  const host = io(URL);
  const a = io(URL);
  const b = io(URL);
  const { code } = await call(host, 'host:create', {});
  if (!/^[A-Z]{4}$/.test(code)) fail('bad code ' + code);

  const bad = await call(a, 'player:join', { code: 'ZZZZ', name: 'x' });
  if (bad.ok) fail('joined a missing room');

  let lastLobby;
  host.on('lobby:update', (l) => (lastLobby = l));
  const ja = await call(a, 'player:join', { code: code.toLowerCase(), name: 'Asim' });
  const jb = await call(b, 'player:join', { code, name: 'Faizan' });
  if (!ja.ok || !jb.ok) fail('join failed');
  const dup = await call(b, 'player:join', { code, name: 'asim' });
  if (dup.ok) fail('duplicate name allowed');

  const got = [];
  for (const s of [host, a, b]) s.once('round:start', (r) => got.push(r));
  const st = await call(host, 'host:start', { code, rounds: 3 });
  if (!st.ok) fail('start failed: ' + st.error);
  await new Promise((r) => setTimeout(r, 300));

  if (!lastLobby || lastLobby.players.length !== 2) fail('lobby did not show 2 players');
  if (got.length !== 3) fail('round:start reached ' + got.length + ' of 3 sockets');
  const r = got[0];
  if (r.round !== 1 || r.shapeId !== 'circle' || r.targetPoints.length !== 64 || r.durationMs !== 10000) {
    fail('bad round:start ' + JSON.stringify(r).slice(0, 120));
  }
  const late = await call(io(URL), 'player:join', { code, name: 'Late' });
  if (late.ok) fail('joined after start');

  console.log('PASS: create, join, lobby:update, host:start, round:start (code ' + code + ')');
  clearTimeout(timer);
  srv.kill();
  process.exit(0);
});
