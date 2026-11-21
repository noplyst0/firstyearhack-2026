// Run every statement in a .sql file, in order, and print the last result.
// Usage from ai/: node run_sql.js setup.sql
const fs = require('fs');
const sf = require('./snowflake');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('usage: node run_sql.js <file.sql>'); process.exit(1); }
  try {
    const stmts = sf.statements(fs.readFileSync(file, 'utf8'));
    let rows = [];
    for (const [i, s] of stmts.entries()) {
      rows = await sf.query(s);
      console.log(`ok ${i + 1}/${stmts.length}: ${s.split('\n')[0].slice(0, 80)}`);
    }
    console.log(rows);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await sf.disconnect();
  }
})();
