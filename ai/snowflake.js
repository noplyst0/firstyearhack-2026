// SkySketch Snowflake helper for the backend (CommonJS, works with require() and import).
// Login comes from environment variables. If ai/.env exists it is loaded automatically;
// the backend can instead set the same variables itself (e.g. from backend/.env).
//
//   const sf = require('../ai/snowflake');
//   await sf.connect();
//   const id = await sf.saveAttempt({ roomCode, playerId, round, shapeId, points });

const path = require('path');
const fs = require('fs');
const snowflake = require('snowflake-sdk');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile); // Node >= 20.12

snowflake.configure({ logLevel: 'ERROR' });

let conn = null;

function connect() {
  if (conn) return Promise.resolve(conn);
  const required = ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PASSWORD'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) return Promise.reject(new Error('Missing env: ' + missing.join(', ')));

  const c = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USER,
    password: process.env.SNOWFLAKE_PASSWORD,
    role: process.env.SNOWFLAKE_ROLE || undefined,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || 'SKYSKETCH_WH',
    database: process.env.SNOWFLAKE_DATABASE || 'SKYSKETCH',
    schema: process.env.SNOWFLAKE_SCHEMA || 'GAME',
  });
  return new Promise((resolve, reject) => {
    c.connect((err) => {
      if (err) return reject(err);
      conn = c;
      resolve(conn);
    });
  });
}

// Run one SQL statement with ? binds; resolves to the result rows.
async function query(sqlText, binds = []) {
  const c = await connect();
  return new Promise((resolve, reject) => {
    c.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows || [])),
    });
  });
}

// Store one traced path. points: [[x,y], ...] in 0..1. Resolves to the new attempt_id.
async function saveAttempt({ roomCode, playerId, round, shapeId, points }) {
  if (!Array.isArray(points)) throw new Error('points must be an array of [x,y]');
  const [{ ID: id }] = await query('SELECT UUID_STRING() AS id');
  // VARIANT can't be bound in VALUES, so insert via SELECT with PARSE_JSON.
  await query(
    `INSERT INTO attempts (attempt_id, room_code, player_id, round, shape_id, points)
     SELECT ?, ?, ?, ?, ?, PARSE_JSON(?)`,
    [id, roomCode, playerId, round, shapeId, JSON.stringify(points)]
  );
  return id;
}

function disconnect() {
  if (!conn) return Promise.resolve();
  const c = conn;
  conn = null;
  return new Promise((resolve) => c.destroy(() => resolve()));
}

module.exports = { connect, query, saveAttempt, disconnect };
