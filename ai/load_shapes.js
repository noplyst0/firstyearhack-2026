// Truncate and reload TARGETS + TARGET_POINTS.
// Target points: 256 per shape (with stroke index for multi-stroke shapes), made from shapes.json strokes with the backend's own maths:
//   normaliseStrokes(resampleStrokes(strokes, 256)).flat()   (idx 0..255, full precision)
// shapes.json `norm` (64 points) is left as is for the backend loader.
// Run from ai/: node load_shapes.js
const path = require('path');
const sf = require('./snowflake');
const shapes = require('./shapes.json');
const { resampleStrokes, normaliseStrokes } = require(
  process.env.SCORE_LOCAL || path.join(__dirname, '..', 'backend', 'scoreLocal.js')
);

const TARGET_N = 256;

function targetPoints(shape) {
  const rs = resampleStrokes(shape.strokes, TARGET_N);
  const ns = rs && normaliseStrokes(rs);
  if (!ns) throw new Error(`shape ${shape.id} ${shape.name}: could not normalise`);
  const pts = ns.flatMap((st, k) => st.map(([x, y]) => [x, y, k])); // [x, y, stroke]
  if (pts.length !== TARGET_N) throw new Error(`shape ${shape.id}: ${pts.length} points, expected ${TARGET_N}`);
  return pts;
}

async function main() {
  const rows = shapes.flatMap((s) => targetPoints(s).map(([x, y, k], i) => [s.id, i, x, y, k]));
  if (process.argv.includes('--dry')) {
    console.log(`dry run: ${shapes.length} shapes, ${rows.length} points`);
    return;
  }
  await sf.query('TRUNCATE TABLE TARGETS');
  await sf.query('TRUNCATE TABLE TARGET_POINTS');
  await sf.query(
    'INSERT INTO TARGETS (shape_id, name, label, difficulty, is_round) VALUES (?, ?, ?, ?, ?)',
    shapes.map((s) => [s.id, s.name, s.label, s.difficulty, !!s.round])
  );
  await sf.query('ALTER TABLE TARGET_POINTS ADD COLUMN IF NOT EXISTS stroke NUMBER'); // v3: multi-stroke shapes
  await sf.query('INSERT INTO TARGET_POINTS (shape_id, idx, x, y, stroke) VALUES (?, ?, ?, ?, ?)', rows);
  const [r] = await sf.query('SELECT COUNT(DISTINCT shape_id) AS shapes, COUNT(*) AS points FROM TARGET_POINTS');
  console.log(`loaded ${r.SHAPES} shapes, ${r.POINTS} points (expected ${shapes.length}, ${rows.length})`);
}

main()
  .catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; })
  .finally(() => sf.disconnect());
