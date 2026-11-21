// Snowflake bridge: a slow scorer loses the 4 s race (shortened here) and local scoring takes over;
// AI comments are cleaned; game stats come from Snowflake.
process.env.SNOWFLAKE_ENABLED = '1';
process.env.SNOWFLAKE_MODULE = require('path').join(__dirname, 'mocks', 'slowSnowflake.js');
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'sky-'));
const test = require('node:test');
const assert = require('node:assert');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');
const mock = require('./mocks/slowSnowflake');

test('slow snowflake -> local scorer, AI comment cleaned, stats from snowflake', async () => {
  const srv = await start({ port: 0, quiet: true, sfMs: { score: 200 }, timing: { countdownMs: 20, durationScale: 0.02, graceMs: 20, resultsBaseMs: 600000 } });
  await new Promise((r) => setTimeout(r, 50)); // init
  const url = `http://localhost:${srv.port}`;
  const s = (x = connect(url, { transports: ['websocket'], forceNew: true })) => x;
  const host = s(), a = s();
  const call = (k, ev, d) => new Promise((r) => k.emit(ev, d, r));
  const ev = (k, e) => new Promise((r) => k.once(e, r));
  try {
    const { code } = await call(host, 'host:create', { test: true });
    const { playerId } = await call(a, 'player:join', { code, name: 'Tester' });
    const results = ev(host, 'round:results');
    const extras = ev(host, 'round:extras');
    const started = ev(a, 'round:start');
    await call(host, 'host:start', { code, rounds: 3 });
    await started;
    const pts = Array.from({ length: 60 }, (_, i) => [0.5 + 0.3 * Math.cos(i / 9.4), 0.5 + 0.3 * Math.sin(i / 9.4)]);
    await call(a, 'player:submit', { code, playerId, round: 0, strokes: [pts], points: pts }); // practice round
    const res = await results;
    assert.strictEqual(res.scorer, 'local');
    assert.ok(res.judgeMs >= 200 && res.judgeMs < 1000, 'judgeMs ' + res.judgeMs);
    assert.strictEqual(mock.calls[0].attempts[0].submittedAt.length, 24, 'real ISO submit time passed to Snowflake');
    assert.strictEqual(mock.calls[0].attempts[0].isPractice, true);
    assert.strictEqual(mock.calls[0].attempts[0].playerName, 'Tester');
    assert.strictEqual(res.practice, true);
    const ex = await extras;
    assert.strictEqual(ex.comments[playerId], 'What a lovely wobbly circle, truly');
    assert.strictEqual((await (await fetch(url + '/health')).json()).snowflake, 'ok', 'failing calls leave the connection up');
    const end = ev(host, 'game:end');
    for (const r of [1, 2, 3]) {
      await call(host, 'host:next', { code });
      await ev(host, 'round:results');
    }
    await call(host, 'host:next', { code });
    const ge = await end;
    assert.strictEqual(ge.stats.source, 'snowflake');
    assert.strictEqual(ge.stats.totalGames, 7);
    // old SQL returned bestEver as a bare number: it must become { name, score, shape }, never NaN
    assert.deepStrictEqual(Object.keys(ge.stats.bestEver).sort(), ['name', 'score', 'shape']);
    assert.strictEqual(ge.stats.bestEver.score, 88.1);
    assert.deepStrictEqual(ge.stats.steadiest, { name: 'Zed', tremor: 3.2 }, 'Snowflake value passes through');
    assert.strictEqual(ge.stats.mostImproved, null, 'malformed Snowflake value -> local (none here)');
    assert.deepStrictEqual(ge.stats.confusion, { shape: 'star', label: 'a potato', pct: 38 });
    assert.strictEqual(ge.stats.totalAttempts, 0, 'NaN totalAttempts from Snowflake falls back to the local count (no real-round drawings here)');
  } finally {
    host.close(); a.close();
    await srv.close();
  }
});
