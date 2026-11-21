// Game loop end to end over real sockets, local scoring, fast timers. Includes backend.md §9 test 8.
process.env.SNOWFLAKE_ENABLED = '0';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sky-'));
const test = require('node:test');
const assert = require('node:assert');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');

const timing = { countdownMs: 30, durationScale: 0.02, graceMs: 30, resultsMs: 600000, extrasDelayMs: 10, hostGraceMs: 400, lobbyGraceMs: 150 };
let srv, url;
const socks = [];
// every socket queues every event it receives, so a test never misses one that arrived early
const sock = () => {
  const s = connect(url, { transports: ['websocket'], forceNew: true });
  s.q = {}; s.w = {};
  s.onAny((ev, p) => {
    const w = s.w[ev] && s.w[ev].shift();
    if (w) w(p); else (s.q[ev] = s.q[ev] || []).push(p);
  });
  socks.push(s);
  return s;
};
const call = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const once = (s, ev, ms = 3000) => {
  if (s.q[ev] && s.q[ev].length) return Promise.resolve(s.q[ev].shift());
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting for ' + ev)), ms);
    (s.w[ev] = s.w[ev] || []).push((p) => { clearTimeout(t); res(p); });
  });
};
const drain = (s, ev) => { s.q[ev] = []; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const circle = (n = 120, r = 0.3) => [Array.from({ length: n }, (_, i) => [0.5 + r * Math.cos((2 * Math.PI * i) / (n - 1)), 0.5 + r * Math.sin((2 * Math.PI * i) / (n - 1))])];
const line = () => [Array.from({ length: 40 }, (_, i) => [0.1 + i * 0.02, 0.5])];
const submit = (s, code, playerId, round, strokes) => call(s, 'player:submit', { code, playerId, round, strokes, points: strokes.flat() });

test.before(async () => { srv = await start({ port: 0, quiet: !process.env.VERBOSE, timing }); url = `http://localhost:${srv.port}`; });
test.after(async () => { socks.forEach((s) => s.close()); await srv.close(); });

test('join rules, ghosts, 3 rounds, duplicate + missing submit, extras, game end, again', async () => {
  const host = sock();
  const created = await call(host, 'host:create', { test: true });
  assert.match(created.code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.strictEqual(created.state, 'LOBBY');
  const code = created.code;

  const a = sock(), b = sock(), c = sock();
  assert.strictEqual((await call(a, 'player:join', { code: 'QQQQ', name: 'A' })).error, 'ROOM_NOT_FOUND');
  assert.strictEqual((await call(a, 'player:join', { code, name: '   ' })).error, 'NAME_INVALID');
  assert.strictEqual((await call(a, 'player:join', { code, name: 'shithead' })).error, 'NAME_BLOCKED');
  const ja = await call(a, 'player:join', { code: code.toLowerCase(), name: 'Asim' });
  assert.ok(ja.ok);
  assert.strictEqual((await call(b, 'player:join', { code, name: 'ASIM' })).error, 'NAME_TAKEN');
  const jb = await call(b, 'player:join', { code, name: '<i>Faizan</i>' });
  assert.ok(jb.ok);
  const jc = await call(c, 'player:join', { code, name: 'Kicked' });

  const kicked = once(c, 'player:kicked');
  assert.ok((await call(host, 'host:kick', { code, playerId: jc.playerId })).ok);
  await kicked;

  drain(host, 'lobby:update');
  const lobby = once(host, 'lobby:update');
  assert.strictEqual((await call(host, 'host:bots', { code, count: 2 })).count, 2);
  const l = await lobby;
  assert.deepStrictEqual(l.players.map((p) => [p.name, p.isBot]), [['Asim', false], ['Faizan', false], ['Ghost 1', true], ['Ghost 2', true]]);

  // round 1: Asim submits a circle, then a line (ignored). Faizan never submits.
  const r1 = once(a, 'round:start');
  assert.ok((await call(host, 'host:start', { code, rounds: 3 })).ok);
  const rs = await r1;
  assert.strictEqual(rs.round, 1); assert.strictEqual(rs.totalRounds, 3); assert.strictEqual(rs.shapeId, 1);
  assert.strictEqual(rs.memory, false); assert.ok(rs.targetStrokes.length && rs.targetPoints.length);
  assert.strictEqual(rs.fov, 40); assert.strictEqual(rs.smoothing, 0.35);
  assert.strictEqual((await call(sock(), 'player:join', { code, name: 'Late' })).error, 'ROOM_STARTED');

  drain(host, 'round:progress');
  const progress = once(host, 'round:progress');
  assert.ok((await submit(a, code, ja.playerId, 1, circle())).ok);
  assert.deepStrictEqual(await progress, { round: 1, submitted: 1, total: 2 });
  assert.strictEqual((await submit(a, code, ja.playerId, 1, line())).error, 'DUPLICATE');
  assert.strictEqual((await submit(a, code, jb.playerId, 1, line())).error, 'UNKNOWN_PLAYER', 'cannot submit for someone else');

  const judging = await once(host, 'round:judging');
  assert.strictEqual(judging.drawings, 3); // Asim + 2 ghosts
  const res = await once(host, 'round:results');
  assert.strictEqual(res.scorer, 'local');
  assert.strictEqual(res.targetNorm.length, 64);
  const [r0, rB, g1, g2] = res.results;
  assert.strictEqual(r0.name, 'Asim'); assert.strictEqual(r0.rank, 1); assert.strictEqual(r0.roundPoints, 300);
  assert.ok(r0.score > 80, 'first submit (circle) kept, score ' + r0.score);
  assert.strictEqual(r0.comment, null, 'featured comment comes in extras');
  assert.strictEqual(r0.guess.shapeId, 1);
  assert.strictEqual(r0.pathStrokes.flat().length, 64);
  assert.strictEqual(rB.name, 'Faizan'); assert.strictEqual(rB.valid, false); assert.strictEqual(rB.roundPoints, 0); assert.ok(rB.comment);
  for (const g of [g1, g2]) { assert.strictEqual(g.isBot, true); assert.strictEqual(g.rank, null); assert.strictEqual(g.roundPoints, 0); assert.ok(g.valid); }
  assert.deepStrictEqual(res.winner.playerId, ja.playerId);
  const ex = await once(host, 'round:extras');
  assert.strictEqual(ex.round, 1); assert.ok(ex.comments[ja.playerId]);

  // round 2: both submit -> ends early, without waiting for the timer
  drain(b, 'round:start');
  const r2 = once(b, 'round:start');
  assert.ok((await call(host, 'host:next', { code })).ok);
  assert.strictEqual((await r2).shapeId, 2);
  await submit(a, code, ja.playerId, 2, circle());
  await submit(b, code, jb.playerId, 2, line());
  const res2 = await once(host, 'round:results');
  assert.strictEqual(res2.results.filter((r) => r.rank).length, 2);
  assert.strictEqual(res2.results.find((r) => r.name === 'Asim').totalPoints, 600);
  assert.strictEqual(res2.results.find((r) => r.name === 'Faizan').totalPoints, 200);

  // phone refresh mid-game: same playerId rejoins and gets the current phase again
  const a2 = sock();
  const again = once(a2, 'round:results');
  assert.ok((await call(a2, 'player:join', { code, name: 'whatever', playerId: ja.playerId })).ok);
  assert.strictEqual((await again).round, 2);

  // round 3 is the memory round, then game end
  drain(host, 'round:start');
  const r3 = once(host, 'round:start');
  await call(host, 'host:next', { code });
  const rs3 = await r3;
  assert.strictEqual(rs3.shapeId, 4); assert.strictEqual(rs3.memory, true);
  await once(host, 'round:results');
  const end = once(host, 'game:end');
  await call(host, 'host:next', { code });
  const ge = await end;
  assert.deepStrictEqual(ge.leaderboard.map((x) => x.name), ['Asim', 'Faizan']);
  assert.strictEqual(ge.stats.source, 'local');

  // host:again: lobby, same players, totals reset
  drain(host, 'lobby:update');
  const back = once(host, 'lobby:update');
  assert.ok((await call(host, 'host:again', { code })).ok);
  const bl = await back;
  assert.ok(bl.players.some((p) => p.name === 'Faizan'));
  drain(host, 'round:start');
  const r1b = once(host, 'round:start');
  await call(host, 'host:start', { code, rounds: 5 });
  assert.strictEqual((await r1b).totalRounds, 5);
});

test('host refresh reclaims the room; room closes when the host stays away', async () => {
  const host = sock();
  const { code } = await call(host, 'host:create', { test: true });
  const p = sock();
  await call(p, 'player:join', { code, name: 'Solo' });
  host.close();
  await wait(100);
  const host2 = sock();
  const re = await call(host2, 'host:create', { code });
  assert.deepStrictEqual(re, { code, state: 'LOBBY' });
  assert.strictEqual((await once(host2, 'lobby:update')).players[0].name, 'Solo');

  const closed = once(p, 'room:closed', 2000);
  host2.close();
  assert.strictEqual((await closed).reason, 'Host left');
});

test('non-host cannot start; health endpoint', async () => {
  const host = sock();
  const { code } = await call(host, 'host:create', { test: true });
  const p = sock();
  await call(p, 'player:join', { code, name: 'Sneaky' });
  assert.strictEqual((await call(p, 'host:start', { code, rounds: 3 })).error, 'NOT_HOST');
  const h = await (await fetch(url + '/health')).json();
  assert.strictEqual(h.ok, true); assert.strictEqual(h.snowflake, 'off');
});
