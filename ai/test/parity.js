// Parity test (plan/ai.md §6): 10 fakeAttempt paths of mixed skill in a TEST game.
// Snowflake saveAndScoreRound vs backend scoreRoundLocal: accuracy within 0.1, same guesses, same ranks, under 3 s.
// Also reports agreement with a 256-point-target local library, to show which target size Snowflake matches.
// Run from ai/: node test/parity.js [shapeId]   (needs backend/.env, setup.sql run, node load_shapes.js)
const path = require('path');
const sf = require('../snowflake');
const B = path.join(__dirname, '..', '..', 'backend');
const S = require(path.join(B, 'scoreLocal.js'));
const { fakeAttempt } = require(path.join(B, 'ghosts.js'));
const shapes = require('../shapes.json');

const shapeId = Number(process.argv[2] || 1);
const lib64 = shapes.map((s) => ({ ...s }));
const lib256 = shapes.map((s) => ({ ...s, norm: S.normaliseStrokes(S.resampleStrokes(s.strokes, 256)).flat() }));

function compare(sfRows, localRows) {
  const byId = new Map(localRows.map((r) => [r.attemptId, r]));
  let maxDiff = 0; const problems = [];
  for (const r of sfRows) {
    const l = byId.get(r.attemptId);
    if (!l) { problems.push(`${r.attemptId}: missing locally`); continue; }
    const d = Math.abs(r.accuracy - l.accuracy);
    maxDiff = Math.max(maxDiff, d);
    if (d > 0.1) problems.push(`${r.attemptId}: accuracy sf ${r.accuracy.toFixed(2)} vs local ${l.accuracy.toFixed(2)}`);
    if (r.guess.shapeId !== l.guess.shapeId) problems.push(`${r.attemptId}: guess sf ${r.guess.label} vs local ${l.guess.label}`);
    if ((r.rank ?? null) !== (l.rank ?? null)) problems.push(`${r.attemptId}: rank sf ${r.rank} vs local ${l.rank}`);
  }
  if (sfRows.length !== localRows.length) problems.push(`row count sf ${sfRows.length} vs local ${localRows.length}`);
  return { maxDiff, problems };
}

(async () => {
  const gameId = `TEST-parity-${Date.now()}`;
  const round = 1;
  const target = lib64.find((s) => s.id === shapeId);
  const t0 = Date.now();
  const attempts = Array.from({ length: 10 }, (_, i) => {
    const raw = fakeAttempt(target.norm, i / 9); // skill 0 .. 1
    const d = S.processDrawing(raw);
    return {
      attemptId: `${gameId}-${round}-p${i}`, playerId: `p${i}`, isBot: false, valid: d.valid,
      nRaw: raw.flat().length, nStrokes: raw.length, durationMs: 10000, submittedAt: t0 + i * 100,
      rawStrokes: raw, pathStrokes: d.pathStrokes,
    };
  });
  try {
    await sf.init();
    await sf.saveGame({ gameId, code: 'PRTY', isTest: true });
    const start = Date.now();
    const sfRows = await sf.saveAndScoreRound({ gameId, round, shapeId, attempts });
    const ms = Date.now() - start;

    const r64 = compare(sfRows, S.scoreRoundLocal(attempts, shapeId, lib64));
    const r256 = compare(sfRows, S.scoreRoundLocal(attempts, shapeId, lib256));
    console.log(`shape ${target.name}, ${attempts.filter((a) => a.valid).length} valid paths, saveAndScoreRound ${ms} ms`);
    for (const r of sfRows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)))
      console.log(`  ${r.attemptId.split('-').pop()}  acc ${r.accuracy.toFixed(2)}  rank ${r.rank}  guess ${r.guess.label}`);
    console.log(`vs local 64-point targets:  max diff ${r64.maxDiff.toFixed(3)}, ${r64.problems.length} problems`);
    console.log(`vs local 256-point targets: max diff ${r256.maxDiff.toFixed(3)}, ${r256.problems.length} problems`);
    const best = r256.problems.length <= r64.problems.length ? r256 : r64;
    best.problems.forEach((p) => console.log('  ' + p));
    const pass = (r64.problems.length === 0 || r256.problems.length === 0) && ms < 3000;
    console.log(pass ? 'PASS' : `FAIL${ms >= 3000 ? ' (slower than 3 s)' : ''}`);
    if (!pass) process.exitCode = 1;
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await sf.disconnect();
  }
})();
