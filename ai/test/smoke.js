// Smoke test: login, one insert, one select, clean up. Run from ai/: node test/smoke.js
// Needs backend/.env, setup.sql run and shapes loaded (node load_shapes.js).
const sf = require('../snowflake');

(async () => {
  const gameId = 'TEST-smoke-' + Date.now();
  try {
    await sf.init();
    console.log('login + ping ok');
    await sf.saveGame({ gameId, code: 'TSTX', isTest: true });
    const rows = await sf.query('SELECT game_id, room_code, is_test FROM GAMES WHERE game_id = ?', [gameId]);
    console.log('selected', rows);
    if (rows.length !== 1 || rows[0].IS_TEST !== true) throw new Error('unexpected select result');
    await sf.query('DELETE FROM GAMES WHERE game_id = ?', [gameId]);
    console.log('OK');
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await sf.disconnect();
  }
})();
