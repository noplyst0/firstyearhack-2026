// Runs every read query once on sample data: percentiles, ghostPool, gameStats, roomView, comments, ping.
// Those queries skip TEST games, so this plays a temporary "SAMPLE-..." game (practice round 0 + 3 real rounds),
// then deletes every row it made.
// Run from ai/: node test/queries.js [players=25]
const path = require('path');
const sf = require('../snowflake');
const B = path.join(__dirname, '..', '..', 'backend');
const S = require(path.join(B, 'scoreLocal.js'));
const { fakeAttempt } = require(path.join(B, 'ghosts.js'));
const shapes = require('../shapes.json');

const players = Number(process.argv[2] || 25);
const ROUNDS = [[0, 1, true], [1, 1, false], [2, 2, false], [3, 6, false]]; // [round, shapeId, practice]
const timed = async (label, p) => {
  const t = Date.now(); const r = await p; console.log(`${label}: ${Date.now() - t} ms`); return r;
};
const show = (v) => console.log('  ' + JSON.stringify(v).slice(0, 400));

(async () => {
  const gameId = `SAMPLE-${Date.now()}`;
  const skill = Array.from({ length: players }, () => Math.random() * 0.7);
  try {
    await timed('init + ping', sf.init());
    await sf.saveGame({ gameId, code: 'SMPL', isTest: false });
    for (const [round, shapeId, practice] of ROUNDS) {
      const target = shapes.find((s) => s.id === shapeId);
      const t0 = Date.now();
      const attempts = skill.map((k, i) => {
        const raw = fakeAttempt(target.norm, Math.min(1, k + round * 0.1)); // players warm up
        const d = S.processDrawing(raw);
        return { attemptId: `${gameId}-${round}-p${i}`, playerId: `p${i}`, playerName: `Player ${i}`,
          isPractice: practice, isBot: false, valid: d.valid, nRaw: raw.flat().length, nStrokes: raw.length,
          durationMs: 10000, submittedAt: t0 + i * 10, rawStrokes: raw, pathStrokes: d.pathStrokes };
      });
      const rows = await timed(`saveAndScoreRound round ${round} ${target.name}${practice ? ' (practice)' : ''}`,
        sf.saveAndScoreRound({ gameId, round, shapeId, attempts }));
      console.log(`  ${rows.length} rows, top ${rows.find((r) => r.rank === 1)?.accuracy.toFixed(1)}, points ${[...new Set(rows.map((r) => r.roundPoints))].join('/')}`);
    }

    const pct = await timed('percentiles (round 3)', sf.percentiles({ shapeId: 6, gameId, round: 3 }));
    show(`${Object.keys(pct).length} rows, e.g. ${JSON.stringify(Object.entries(pct)[0])}`);

    const ghosts = await timed('ghostPool', sf.ghostPool({ shapeId: 1, count: 5 }));
    show(`${ghosts.length} ghosts, first has ${ghosts[0]?.pathStrokes.flat().length} points`);

    if (sf.roomView) {
      const rv = await timed('roomView (round 3)', sf.roomView({ gameId, round: 3 }));
      show(rv && { heat: rv.heat?.length, heatMax: rv.heat && Math.max(...rv.heat), crowdPoints: rv.crowd?.path?.length, crowdStrokes: rv.crowd?.strokes?.length, crowdScore: rv.crowd?.score, alone: rv.alone });
    }

    show(await timed('gameStats (this game)', sf.gameStats({ gameId })));
    show(await timed('gameStats (all time)', sf.gameStats()));

    show(await timed('comments (SNOWFLAKE_MODEL empty)', sf.comments([{ attemptId: 'x', prompt: 'hi' }])));
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
