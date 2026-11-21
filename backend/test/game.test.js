// Game loop end to end over real sockets, local scoring, fast timers. Includes backend.md §9 test 8.
process.env.SNOWFLAKE_ENABLED = '0';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sky-'));
const test = require('node:test');
const assert = require('node:assert');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');

const timing = { countdownMs: 30, durationScale: 0.02, graceMs: 30, resultsBaseMs: 600000, extrasDelayMs: 10, hostGraceMs: 400, lobbyGraceMs: 150 };
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

  // practice round 0: scored and ranked, but no points
  const st0 = once(a, 'round:start');
  assert.ok((await call(host, 'host:start', { code, rounds: 3 })).ok);
  const p0 = await st0;
  assert.strictEqual(p0.round, 0); assert.strictEqual(p0.practice, true); assert.strictEqual(p0.totalRounds, 3);
  assert.strictEqual(p0.shapeId, 1); assert.strictEqual(p0.durationMs, Math.round(10000 * timing.durationScale)); assert.strictEqual(p0.memory, false);
  await submit(a, code, ja.playerId, 0, circle());
  await submit(b, code, jb.playerId, 0, line());
  await once(host, 'round:judging');
  const pr = await once(host, 'round:results');
  assert.strictEqual(pr.practice, true); assert.strictEqual(pr.round, 0);
  assert.deepStrictEqual(pr.results.filter((r) => !r.isBot).map((r) => [r.name, r.rank, r.roundPoints, r.totalPoints]), [['Asim', 1, 0, 0], ['Faizan', 2, 0, 0]]);
  assert.ok(pr.results.filter((r) => r.isBot).every((r) => r.roundPoints === 0 && r.rank === null));
  await once(host, 'round:extras');

  // round 1: Asim submits a circle, then a line (ignored). Faizan never submits.
  drain(a, 'round:start');
  const r1 = once(a, 'round:start');
  assert.ok((await call(host, 'host:next', { code })).ok);
  const rs = await r1;
  assert.strictEqual(rs.practice, false);
  assert.strictEqual(rs.round, 1); assert.strictEqual(rs.totalRounds, 3); assert.strictEqual(rs.shapeId, 1);
  assert.strictEqual(rs.memory, false); assert.ok(rs.targetStrokes.length && rs.targetPoints.length);
  assert.strictEqual(rs.fov, 60); assert.strictEqual(rs.smoothing, 0.35);
  assert.strictEqual((await call(sock(), 'player:join', { code, name: 'Late' })).error, 'ROOM_STARTED');

  drain(host, 'round:progress');
  const progress = once(host, 'round:progress');
  assert.ok((await submit(a, code, ja.playerId, 1, circle())).ok);
  assert.deepStrictEqual(await progress, { round: 1, submitted: 1, total: 2 });
  assert.strictEqual((await submit(a, code, ja.playerId, 1, line())).error, 'DUPLICATE');
  assert.strictEqual((await submit(a, code, jb.playerId, 1, line())).error, 'UNKNOWN_PLAYER', 'cannot submit for someone else');

  const judging = await once(host, 'round:judging');
  assert.strictEqual(judging.drawings, 3); // Asim + 2 ghosts
  assert.strictEqual(judging.distanceChecks, 3 * 64 * 256 * require('../shapes').library.length);
  const res = await once(host, 'round:results');
  assert.strictEqual(res.scorer, 'local');
  assert.strictEqual(res.targetNorm.length, 64);
  assert.ok(Array.isArray(res.targetNormStrokes) && Array.isArray(res.targetNormStrokes[0][0]), 'targetNormStrokes is [[[x,y]...]...]');
  assert.strictEqual(res.targetNormStrokes.flat().length, 256);
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
  drain(host, 'round:extras');
  const res2 = await once(host, 'round:results');
  const ex2 = await once(host, 'round:extras');
  assert.strictEqual(ex2.heat.length, 256, 'room view heat on 256 points');
  assert.ok(ex2.heat.every((h) => h >= 0 && h <= 1) && ex2.heat.includes(1));
  assert.strictEqual(ex2.crowd.path.length, 256);
  assert.ok(ex2.crowd.score >= 0 && ex2.crowd.score <= 100);
  const avg = res2.results.filter((r) => r.rank).reduce((t, r) => t + r.score, 0) / 2;
  assert.strictEqual(ex2.alone, Math.round(avg * 10) / 10);
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

test('results auto-advance: 22 s + 3.5 s per real player, capped at 90 s', () => {
  const { resultsDelayMs } = require('../game');
  assert.strictEqual(resultsDelayMs(0), 22000);
  assert.strictEqual(resultsDelayMs(1), 25500);
  assert.strictEqual(resultsDelayMs(4), 36000);
  assert.strictEqual(resultsDelayMs(19), 88500);
  assert.strictEqual(resultsDelayMs(20), 90000);
  assert.strictEqual(resultsDelayMs(150), 90000);
});

test('results auto-advance counts real players only (ghosts excluded) and fires on its own', async () => {
  // separate server: base 100 ms + 150 ms per real player, so 2 real players = 400 ms; 20 ghosts must not add time
  const fast = await start({ port: 0, quiet: true, timing: { ...timing, resultsBaseMs: 100, resultsPerPlayerMs: 150, resultsMaxMs: 5000 } });
  const u = `http://localhost:${fast.port}`;
  const mk = () => { const s = connect(u, { transports: ['websocket'], forceNew: true }); socks.push(s); return s; };
  try {
    const host = mk(), a = mk(), b = mk();
    const { code } = await call(host, 'host:create', { test: true });
    const ja = await call(a, 'player:join', { code, name: 'One' });
    const jb = await call(b, 'player:join', { code, name: 'Two' });
    await call(host, 'host:bots', { code, count: 20 });
    const got = (ev) => new Promise((r) => host.once(ev, r));
    const firstStart = got('round:start');
    await call(host, 'host:start', { code, rounds: 3 });
    await firstStart;
    const results = got('round:results');
    await submit(a, code, ja.playerId, 0, circle()); // practice round
    await submit(b, code, jb.playerId, 0, circle());
    await results;
    const t0 = Date.now();
    await got('round:start');
    const waited = Date.now() - t0;
    assert.ok(waited >= 350 && waited < 1000, `advanced after ${waited} ms, expected about 400`);
  } finally {
    await fast.close();
  }
});

test('practice round: no points, kept out of stats and the attempts file, then 3 real rounds', async () => {
  const fs = require('fs');
  const file = require('../store').FILE;
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;
  const host = sock(), a = sock();
  const { code } = await call(host, 'host:create', {}); // a real (non-TEST) game, so attempts are stored
  const { playerId } = await call(a, 'player:join', { code, name: 'Practiser' });
  const starts = [];
  a.on('round:start', (r) => starts.push([r.round, r.practice, r.memory, r.shapeId]));
  await call(host, 'host:start', { code, rounds: 3 });
  const totals = [];
  for (let round = 0; round <= 3; round++) {
    await once(a, 'round:start');
    await submit(a, code, playerId, round, circle());
    const res = await once(host, 'round:results');
    assert.strictEqual(res.round, round);
    assert.strictEqual(res.practice, round === 0);
    const me = res.results[0];
    assert.strictEqual(me.rank, 1, 'practice still ranks');
    totals.push([me.roundPoints, me.totalPoints]);
    const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;
    assert.strictEqual(lines - before, round, `after round ${round} the file should hold ${round} new attempts`);
    if (round < 3) await call(host, 'host:next', { code });
  }
  assert.deepStrictEqual(starts, [[0, true, false, 1], [1, false, false, 1], [2, false, false, 2], [3, false, true, 4]]);
  assert.deepStrictEqual(totals, [[0, 0], [300, 300], [300, 600], [300, 900]]);
  const end = once(host, 'game:end');
  await call(host, 'host:next', { code });
  const ge = await end;
  assert.deepStrictEqual(ge.leaderboard, [{ playerId, name: 'Practiser', total: 900 }]);
  assert.strictEqual(ge.stats.totalAttempts, 3, 'practice excluded from stats');
  assert.deepStrictEqual(Object.keys(ge.stats.bestEver).sort(), ['name', 'score', 'shape']);
  assert.strictEqual(ge.stats.bestEver.name, 'Practiser');
  assert.strictEqual(ge.stats.steadiest.name, 'Practiser'); assert.ok(Number.isFinite(ge.stats.steadiest.tremor));
  assert.deepStrictEqual(ge.stats.perShape.map((x) => x.shape), ['circle', 'triangle', 'star']);
  assert.ok(ge.stats.confusion && ge.stats.confusion.label, 'a circle on the star round is a confusion');
  for (const k of ['bestEver', 'steadiest', 'mostImproved', 'confusion', 'perShape', 'totalAttempts', 'totalGames', 'hardestShape']) assert.ok(k in ge.stats, k);
  assert.deepStrictEqual(ge.stats.avgByShape.map((s) => s.shape), ['circle', 'triangle', 'star']);
});

test('a late submit for the practice round is refused once round 1 starts', async () => {
  const host = sock(), a = sock(), b = sock();
  const { code } = await call(host, 'host:create', { test: true });
  const ja = await call(a, 'player:join', { code, name: 'Quick' });
  const jb = await call(b, 'player:join', { code, name: 'Slow' });
  await call(host, 'host:start', { code, rounds: 3 });
  await once(a, 'round:start');
  await submit(a, code, ja.playerId, 0, circle());
  await once(host, 'round:results'); // Slow missed practice: timer ended it
  await call(host, 'host:next', { code });
  await once(host, 'round:start');
  await once(host, 'round:start');
  assert.strictEqual((await submit(b, code, jb.playerId, 0, circle())).error, 'ROUND_CLOSED');
  assert.ok((await submit(b, code, jb.playerId, 1, circle())).ok);
});

test('host:endRound sends round:stop and judges within 2 s; checkAllIn still ends a round early', async () => {
  // real 10 s practice round, so only an early end can judge it in time
  const slow = await start({ port: 0, quiet: true, timing: { ...timing, durationScale: 1, countdownMs: 50 } });
  const u = `http://localhost:${slow.port}`;
  const mk = () => { const s = connect(u, { transports: ['websocket'], forceNew: true }); s.q = {}; s.w = {};
    s.onAny((ev, p) => { const w = s.w[ev] && s.w[ev].shift(); if (w) w(p); else (s.q[ev] = s.q[ev] || []).push(p); }); socks.push(s); return s; };
  try {
    const host = mk(), a = mk(), b = mk();
    const { code } = await call(host, 'host:create', { test: true });
    const ja = await call(a, 'player:join', { code, name: 'Ann' });
    const jb = await call(b, 'player:join', { code, name: 'Bob' });
    assert.strictEqual((await call(host, 'host:endRound', { code })).error, 'NOT_IN_ROUND');

    await call(host, 'host:start', { code, rounds: 3 });
    const st = await once(a, 'round:start');
    assert.strictEqual(st.round, 0);
    assert.strictEqual((await call(a, 'host:endRound', { code })).error, 'NOT_HOST');
    await submit(a, code, ja.playerId, 0, circle());

    const t0 = Date.now();
    assert.ok((await call(host, 'host:endRound', { code })).ok);
    assert.deepStrictEqual(await once(b, 'round:stop'), { round: 0 });
    assert.deepStrictEqual(await once(host, 'round:stop'), { round: 0 });
    const res = await once(host, 'round:results', 2500);
    const took = Date.now() - t0;
    assert.ok(took < 2000, `judged ${took} ms after host:endRound`);
    assert.ok(took >= 1400, `waited ${took} ms for late submits`);
    assert.strictEqual(res.round, 0);
    assert.deepStrictEqual(res.results.map((r) => [r.name, r.valid]), [['Ann', true], ['Bob', false]]);
    assert.strictEqual((await call(host, 'host:endRound', { code })).error, 'NOT_IN_ROUND');

    // round 1: both submit after round:stop, so judging comes well before the 1.5 s wait
    await call(host, 'host:next', { code });
    const st1 = await once(a, 'round:start');
    assert.strictEqual(st1.round, 1);
    const t1 = Date.now();
    assert.ok((await call(host, 'host:endRound', { code })).ok);
    await once(a, 'round:stop'); await once(b, 'round:stop');
    await submit(a, code, ja.playerId, 1, circle());
    await submit(b, code, jb.playerId, 1, line());
    const r1 = await once(host, 'round:results', 2500);
    assert.ok(Date.now() - t1 < 1000, 'everyone in, so judged before the stop wait ran out');
    assert.ok(r1.results.every((r) => r.valid));

    // round 2: no host action, every real player submits, round ends without waiting for the timer
    await call(host, 'host:next', { code });
    await once(a, 'round:start');
    const t2 = Date.now();
    await submit(a, code, ja.playerId, 2, circle());
    await submit(b, code, jb.playerId, 2, circle());
    await once(host, 'round:results', 2500);
    assert.ok(Date.now() - t2 < 1000, 'checkAllIn ended the round');
  } finally {
    await slow.close();
  }
});
