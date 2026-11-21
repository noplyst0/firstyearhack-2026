// Smoke test: one insert + one select against Snowflake. Run from ai/: `node test.js`
// Needs ai/.env (see env.example) and setup.sql already run.
const sf = require('./snowflake');
const shapes = require('./shapes.json');

(async () => {
  try {
    const id = await sf.saveAttempt({
      roomCode: 'TEST',
      playerId: 'test-player',
      round: 1,
      shapeId: 'circle',
      points: shapes.circle,
    });
    console.log('inserted attempt', id);
    const rows = await sf.query(
      'SELECT attempt_id, room_code, round, shape_id, ARRAY_SIZE(points) AS n FROM attempts WHERE attempt_id = ?',
      [id]
    );
    console.log('selected', rows);
    if (rows.length !== 1 || rows[0].N !== 64) throw new Error('unexpected select result');
    await sf.query('DELETE FROM attempts WHERE attempt_id = ?', [id]); // keep the table clean
    console.log('OK');
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await sf.disconnect();
  }
})();
