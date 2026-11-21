// Runs every read query once on sample data: percentiles, ghostPool, gameStats, comments, ping.
// Those queries skip TEST games, so this plays a temporary "SAMPLE-..." game, then deletes every row it made.
// Run from ai/: node test/queries.js [players=25] [shapeId=1]
const path = require('path');
const sf = require('../snowflake');
const B = path.join(__dirname, '..', '..', 'backend');
const S = require(path.join(B, 'scoreLocal.js'));
const { fakeAttempt } = require(path.join(B, 'ghosts.js'));
const shapes = require('../shapes.json');

const players = Number(process.argv[2] || 25);
const shapeId = Number(process.argv[3] || 1);
const timed = async (label, p) => {
  const t = Date.now(); const r = await p; console.log(`${label}: ${Date.now() - t} ms`); return r;
};

(async () => {
  const gameId = `SAMPLE-${Date.now()}`;
  const target = shapes.find((s) => s.id === shapeId);
  const t0 = Date.now();
  const attempts = Array.from({ length: players }, (_, i) => {
    const raw = fakeAttempt(target.norm, Math.random());
    const d = S.processDrawing(raw);
    return { attemptId: `${gameId}-1-p${i}`, playerId: `p${i}`, isBot: false, valid: d.valid,
      nRaw: raw.flat().length, nStrokes: 1, durationMs: 10000, submittedAt: t0 + i * 10,
      rawStrokes: raw, pathStrokes: d.pathStrokes };
  });
  try {
    await timed('init + ping', sf.init());
    await sf.saveGame({ gameId, code: 'SMPL', isTest: false });
    const rows = await timed(`saveAndScoreRound (${players} players)`, sf.saveAndScoreRound({ gameId, round: 1, shapeId, attempts }));
    console.log(`  ${rows.length} rows, top: ${rows.find((r) => r.rank === 1)?.accuracy.toFixed(1)}`);

    const pct = await timed('percentiles', sf.percentiles({ shapeId, gameId, round: 1 }));
    const first = Object.entries(pct)[0];
    console.log(`  ${Object.keys(pct).length} rows, e.g. ${first && JSON.stringify(first)}`);

    const ghosts = await timed('ghostPool', sf.ghostPool({ shapeId, count: 5 }));
    console.log(`  ${ghosts.length} ghosts, first has ${ghosts[0]?.pathStrokes.flat().length} points in ${ghosts[0]?.pathStrokes.length} stroke(s)`);

    const stats = await timed('gameStats', sf.gameStats());
    console.log('  ' + JSON.stringify(stats));

    const com = await timed('comments (SNOWFLAKE_MODEL empty)', sf.comments([{ attemptId: 'x', prompt: 'hi' }]));
    console.log('  ' + JSON.stringify(com));
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    try {
      const sub = 'SELECT attempt_id FROM ATTEMPTS WHERE game_id = ?';
      await sf.query(`DELETE FROM SCORES WHERE attempt_id IN (${sub})`, [gameId]);
      await sf.query(`DELETE FROM ATTEMPT_POINTS WHERE attempt_id IN (${sub})`, [gameId]);
      await sf.query('DELETE FROM ATTEMPTS WHERE game_id = ?', [gameId]);
      await sf.query('DELETE FROM GAMES WHERE game_id = ?', [gameId]);
      console.log('cleaned up', gameId);
    } catch (e) { console.error('cleanup failed:', e.message); }
    await sf.disconnect();
  }
})();
