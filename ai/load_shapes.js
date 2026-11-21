// Truncate and reload TARGETS + TARGET_POINTS from shapes.json (norm points, idx 0..63).
// Run from ai/: node load_shapes.js
const sf = require('./snowflake');
const shapes = require('./shapes.json');

(async () => {
  try {
    await sf.query('TRUNCATE TABLE TARGETS');
    await sf.query('TRUNCATE TABLE TARGET_POINTS');
    await sf.query(
      'INSERT INTO TARGETS (shape_id, name, label, difficulty, is_round) VALUES (?, ?, ?, ?, ?)',
      shapes.map((s) => [s.id, s.name, s.label, s.difficulty, !!s.round])
    );
    await sf.query(
      'INSERT INTO TARGET_POINTS (shape_id, idx, x, y) VALUES (?, ?, ?, ?)',
      shapes.flatMap((s) => s.norm.map(([x, y], i) => [s.id, i, x, y]))
    );
    const [r] = await sf.query('SELECT COUNT(DISTINCT shape_id) AS shapes, COUNT(*) AS points FROM TARGET_POINTS');
    console.log(`loaded ${r.SHAPES} shapes, ${r.POINTS} points`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await sf.disconnect();
  }
})();
