// node --test test/  (plan/backend.md §9, tests 1 to 7; test 8 is in game.test.js)
const test = require('node:test');
const assert = require('node:assert');
const S = require('../scoreLocal');
const C = require('../constants');
const { library, byId } = require('../shapes');

// triangle and square are stored as bare vertices (under 8 raw points); densify those like a phone would
const dense = (strokes) => (strokes.flat().length >= C.MIN_RAW_POINTS ? strokes : strokes.map((st) => S.resample(st, 200)));
const score = (strokes, shapeId) => {  // attempt (64 points) against the 256-point target
  const d = S.processDrawing(strokes);
  if (!d.valid) return null;
  const att = d.pathStrokes.flat();
  return { ...S.scoreAgainst(att, S.targetPoints(byId(shapeId)), C.D_MAX), guess: S.guess(att, library, shapeId, C.D_MAX) };
};
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
const circlePts = (n = 200, cx = 0.5, cy = 0.5, r = 0.4) =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / (n - 1)), cy + r * Math.sin((2 * Math.PI * i) / (n - 1))]);

const self = {};
// With 256-point targets a perfect 64-point trace tops out at about 92 to 95 (64 points can't cover all 256),
// so test 1 checks at least 90 instead of 98. In exchange the score no longer depends on where you start.
test('1. every round shape scored against itself is at least 90', () => {
  for (const s of library.filter((x) => x.round)) {
    const r = score(dense(s.strokes), s.id);
    self[s.id] = r.accuracy;
    assert.ok(r.accuracy >= 90, `${s.name} self score ${r.accuracy}`);
  }
});

test('2. circle shifted and scaled x2 stays within 1 point', () => {
  const base = score([circlePts()], 1).accuracy;
  const moved = score([circlePts(200).map(([x, y]) => [x * 2 + 0.3, y * 2 - 0.1])], 1).accuracy;
  assert.ok(Math.abs(base - moved) <= 1, `${base} vs ${moved}`);
});

test('3. circle on the triangle target is at least 25 below, and guesses circle', () => {
  const tri = score(dense(byId(2).strokes), 2).accuracy;
  const r = score([circlePts()], 2);
  assert.ok(r.accuracy <= tri - 25, `circle on triangle ${r.accuracy.toFixed(1)} vs self ${tri.toFixed(1)}`);
  assert.strictEqual(r.guess.shapeId, 1, 'guess was ' + r.guess.label);
});

test('4. straight line on the circle is under 20; five identical points are invalid', () => {
  const line = score([[[0.1, 0.5], [0.9, 0.5]].concat(Array.from({ length: 20 }, (_, i) => [0.1 + 0.04 * i, 0.5]))], 1);
  assert.ok(line.accuracy < 20, 'line ' + line.accuracy);
  assert.strictEqual(S.processDrawing([Array(5).fill([0.4, 0.4])]).valid, false);
  assert.strictEqual(S.processDrawing([Array(50).fill([0.4, 0.4])]).valid, false, 'no movement is invalid');
});

test('5. random scribble on the circle (for D_MAX tuning)', () => {
  const runs = Array.from({ length: 20 }, () => score([Array.from({ length: 300 }, () => [Math.random(), Math.random()])], 1).accuracy);
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  console.log(`   scribble on circle: avg ${avg.toFixed(1)}, min ${Math.min(...runs).toFixed(1)}, max ${Math.max(...runs).toFixed(1)} (D_MAX ${C.D_MAX})`);
  assert.ok(avg < 50, 'scribbles score far too high');
});

test('6. every library shape plus noise 0.03 guesses itself', () => {
  const fails = [];
  for (const s of library) {
    let wrong = 0, lastWrong = null;
    for (let k = 0; k < 10; k++) {
      const noisy = s.strokes.map((st) => S.resample(st, 120).map(([x, y]) => [x + gauss() * 0.03, y + gauss() * 0.03]));
      const g = score(noisy, s.id).guess;
      if (g.shapeId !== s.id) { wrong++; lastWrong = g.label; }
    }
    if (wrong > 2) fails.push(`${s.name} -> ${lastWrong} (${wrong}/10)`);
  }
  if (fails.length) console.log('   guess failures: ' + fails.join(', '));
  assert.deepStrictEqual(fails, []);
});

test('7. circle with 3 small gaps as 3 strokes is within 2 points of one stroke', () => {
  // averaged over start angles: a single 64-point sample can sit exactly on the target's points or between them
  let one = 0, three = 0;
  const phases = 12, gap = 9; // 9 of 300 points = 3% of the outline
  for (let k = 0; k < phases; k++) {
    const ph = (2 * Math.PI * k) / phases + 0.123;
    const full = Array.from({ length: 300 }, (_, i) => {
      const a = ph + (2 * Math.PI * i) / 299;
      return [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)];
    });
    one += score([full], 1).accuracy / phases;
    three += score([full.slice(0, 100 - gap), full.slice(100, 200 - gap), full.slice(200, 300 - gap)], 1).accuracy / phases;
  }
  console.log(`   one stroke ${one.toFixed(1)}, three strokes with gaps ${three.toFixed(1)}`);
  assert.ok(Math.abs(one - three) <= 2, `${one} vs ${three}`);
});

test('ranking: ties go to coverage then earlier submit; ghosts never rank', () => {
  const rows = S.rankAttempts([
    { attemptId: 'a', valid: true, isBot: false, accuracy: 80, coverage: 70, submittedAt: 2000 },
    { attemptId: 'b', valid: true, isBot: false, accuracy: 80, coverage: 70, submittedAt: 1000 },
    { attemptId: 'c', valid: true, isBot: false, accuracy: 80, coverage: 75, submittedAt: 3000 },
    { attemptId: 'g', valid: true, isBot: true, accuracy: 99, coverage: 99, submittedAt: 0 },
    { attemptId: 'd', valid: true, isBot: false, accuracy: 10, coverage: 10, submittedAt: 0 },
    { attemptId: 'x', valid: false, isBot: false },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.attemptId, [r.rank, r.roundPoints]]));
  assert.deepStrictEqual(by, { c: [1, 300], b: [2, 200], a: [3, 100], d: [4, 50], g: [null, 0], x: [null, 0] });
});

test('scoreRoundLocal returns one row per valid drawing', () => {
  const rows = S.scoreRoundLocal([
    { attemptId: 'a', valid: true, isBot: false, submittedAt: 1, pathStrokes: S.processDrawing([circlePts()]).pathStrokes },
    { attemptId: 'b', valid: false, isBot: false, pathStrokes: null },
  ], 1, library);
  assert.strictEqual(rows.length, 1);
  assert.ok(rows[0].score >= 90 && rows[0].rank === 1 && rows[0].guess.shapeId === 1);
});

test('a perfect circle starting at 8 different angles scores within 2 points of itself', () => {
  const scores = [];
  for (let k = 0; k < 8; k++) {
    const ph = (2 * Math.PI * k) / 8 + 0.05 * k; // includes starts that fall between the old 64 target points
    const pts = Array.from({ length: 300 }, (_, i) => {
      const a = ph + (2 * Math.PI * i) / 299;
      return [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)];
    });
    scores.push(score([pts], 1).accuracy);
  }
  const spread = Math.max(...scores) - Math.min(...scores);
  console.log(`   perfect circle, 8 starts: ${scores.map((s) => s.toFixed(1)).join(' ')} (spread ${spread.toFixed(2)})`);
  assert.ok(spread <= 2, 'spread ' + spread);
});

test('targets score on 256 points built from strokes, attempts stay at 64', () => {
  assert.strictEqual(S.targetPoints(byId(1)).length, 256);
  assert.strictEqual(S.processDrawing([circlePts()]).pathStrokes.flat().length, 64);
});

test('telemetry-aware comments react to guess, coverage, memory, strokes and rank', () => {
  const canned = require('../canned');
  const ctx = { shapeId: 4, shapeLabel: 'a star', n: 5 };
  const base = { valid: true, score: 50, onLine: 50, coverage: 50, guess: { shapeId: 4, label: 'a star' }, rank: 3, nStrokes: 2 };
  const pool = (k, v) => canned.LINES[k].map((l) => canned.fill(l, v));
  const inPool = (line, k, v = {}) => assert.ok(pool(k, v).includes(line), `"${line}" not from ${k}`);
  inPool(canned.forAttempt({ ...base, guess: { shapeId: 12, label: 'a potato' } }, ctx), 'wrongGuess', { shape: 'a star', guess: 'a potato' });
  inPool(canned.forAttempt({ ...base, onLine: 90, coverage: 28 }, ctx), 'partial', { shape: 'a star', coverage: 28 });
  inPool(canned.forAttempt({ ...base, onLine: 30, coverage: 80 }, ctx), 'wander', { shape: 'a star' });
  inPool(canned.forAttempt({ ...base, score: 80 }, { ...ctx, memory: true }), 'memory');
  inPool(canned.forAttempt({ ...base, nStrokes: 9 }, ctx), 'manyStrokes', { strokes: 9 });
  inPool(canned.forAttempt({ ...base, rank: 1, score: 85 }, ctx), 'winner');
  inPool(canned.forAttempt({ ...base, rank: 5 }, ctx), 'last');
  inPool(canned.forAttempt({ valid: false, missing: true }, ctx), 'missing');
  // no template is left unfilled, and two players rarely share a line
  const used = new Set();
  const lines = Array.from({ length: 4 }, () => canned.forAttempt({ ...base, guess: { shapeId: 12, label: 'a potato' } }, { ...ctx, used }));
  assert.strictEqual(new Set(lines).size, 4);
  assert.ok(lines.every((l) => !/[{}]/.test(l)));
});

test('targetNormStrokes keeps strokes apart for multi-stroke shapes', () => {
  const two = { id: 2001, strokes: [[[0.2, 0.2], [0.4, 0.2]], [[0.6, 0.8], [0.8, 0.8]]] };
  const st = S.targetNormStrokes(two);
  assert.strictEqual(st.length, 2);
  assert.strictEqual(st.flat().length, 256);
});

test('room view: crowd of wobbly circles beats the average player; heat is highest where everyone missed', () => {
  const shape = byId(1);
  const paths = [], scores = [];
  for (let k = 0; k < 6; k++) {
    // each player misses a different side, and everyone skips the same 90 degree arc (angles 0..pi/2)
    const pts = Array.from({ length: 200 }, (_, i) => {
      const a = Math.PI / 2 + (1.5 * Math.PI * i) / 199;
      const r = 0.4 + 0.06 * Math.cos(a - k);
      return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
    });
    const d = S.processDrawing([pts]);
    paths.push(d.pathStrokes.flat());
    scores.push(S.round1(S.scoreAgainst(d.pathStrokes.flat(), S.targetPoints(shape)).accuracy));
  }
  const v = S.roomViewLocal(shape, paths, scores);
  assert.strictEqual(v.heat.length, 256);
  assert.strictEqual(v.crowd.path.length, 256);
  const tgt = S.targetPoints(shape);
  const hot = tgt.findIndex((_, j) => v.heat[j] === 1);
  const ang = (Math.atan2(tgt[hot][1], tgt[hot][0]) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(ang < Math.PI / 2 + 0.2, 'hottest point is in the arc nobody drew, angle ' + ang.toFixed(2));
  console.log(`   room view: alone ${v.alone}, together ${v.crowd.score}`);
  assert.strictEqual(S.roomViewLocal(shape, paths.slice(0, 1), scores), null, 'needs 2 drawings');
});

test('tremor: a wobbly circle is less steady than a clean one', () => {
  const clean = S.processDrawing([circlePts(300)]).pathStrokes;
  const shaky = S.processDrawing([circlePts(300).map(([x, y]) => [x + gauss() * 0.01, y + gauss() * 0.01])]).pathStrokes;
  assert.ok(S.tremor(clean) < S.tremor(shaky), `${S.tremor(clean)} vs ${S.tremor(shaky)}`);
});
