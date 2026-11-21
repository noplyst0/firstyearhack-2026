// SkySketch Snowflake API for the backend (plan/ai.md §4). CommonJS.
// Every function rejects on error; the backend owns the timeouts and the local fallback.
// Login: backend/.env (never committed). Variables: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER,
// SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY_PATH, SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE (SKY_WH),
// SNOWFLAKE_DATABASE (SKYSKETCH), SNOWFLAKE_SCHEMA (GAME), SNOWFLAKE_MODEL.
// Stretch functions (saveTarget, roomView, roomVerdict, visionGuess) are not written yet.

const fs = require('fs');
const path = require('path');
const snowflake = require('snowflake-sdk');

snowflake.configure({ logLevel: 'ERROR' });

const ENV_FILE = path.join(__dirname, '..', 'backend', '.env');
const sqlFile = (name) => fs.readFileSync(path.join(__dirname, 'sql', name), 'utf8');
// split a .sql file into statements on ";" at end of line; drops comment-only chunks
const statements = (text) =>
  text.split(/;[ \t]*(?:--[^\n]*)?(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

const SQL = {
  score: statements(sqlFile('score_round.sql'))[0],
  read: statements(sqlFile('read_round.sql'))[0],
  percentiles: statements(sqlFile('percentiles.sql'))[0],
  ghostPool: statements(sqlFile('ghost_pool.sql'))[0],
  stats: statements(sqlFile('stats.sql')), // [headline, byShape]
};

let conn = null;
let connecting = null;

function loadEnv() {
  if (fs.existsSync(ENV_FILE)) {
    try { process.loadEnvFile(ENV_FILE); } catch (_) { /* vars already set by the backend */ }
  }
}

function connect() {
  if (conn) return Promise.resolve(conn);
  if (connecting) return connecting;
  loadEnv();
  const e = process.env;
  const missing = ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER'].filter((k) => !e[k]);
  if (!e.SNOWFLAKE_PASSWORD && !e.SNOWFLAKE_PRIVATE_KEY_PATH) missing.push('SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY_PATH');
  if (missing.length) return Promise.reject(new Error('Snowflake env missing: ' + missing.join(', ')));

  const opts = {
    account: e.SNOWFLAKE_ACCOUNT,
    username: e.SNOWFLAKE_USER,
    role: e.SNOWFLAKE_ROLE || undefined,
    warehouse: e.SNOWFLAKE_WAREHOUSE || 'SKY_WH',
    database: e.SNOWFLAKE_DATABASE || 'SKYSKETCH',
    schema: e.SNOWFLAKE_SCHEMA || 'GAME',
    clientSessionKeepAlive: true,
  };
  if (e.SNOWFLAKE_PRIVATE_KEY_PATH) {
    opts.authenticator = 'SNOWFLAKE_JWT'; // key-pair login, for when MFA blocks passwords
    opts.privateKeyPath = e.SNOWFLAKE_PRIVATE_KEY_PATH;
  } else {
    opts.password = e.SNOWFLAKE_PASSWORD;
  }

  const c = snowflake.createConnection(opts);
  connecting = new Promise((resolve, reject) => {
    c.connect((err) => {
      connecting = null;
      if (err) return reject(err);
      conn = c;
      resolve(c);
    });
  });
  return connecting;
}

// one statement with ? binds (binds may be an array of arrays for a bulk insert) -> rows
async function query(sqlText, binds = []) {
  const c = await connect();
  return new Promise((resolve, reject) => {
    c.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          // a dropped session should reconnect on the next call
          if (/terminated|session.*(expired|no longer exists)|not connected/i.test(err.message)) conn = null;
          return reject(err);
        }
        resolve(rows || []);
      },
    });
  });
}

const tsNtz = (ms) => new Date(ms ?? Date.now()).toISOString().replace('T', ' ').replace('Z', '');
const parseMaybe = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// ---------- API ----------

async function init() {
  await connect();
  await ping();
}

function ping() {
  return query('SELECT SUM(x) AS s FROM TARGET_POINTS');
}

function saveGame({ gameId, code, isTest }) {
  return query('INSERT INTO GAMES (game_id, room_code, is_test) VALUES (?, ?, ?)', [gameId, code, !!isTest]);
}

// attempts: [{ attemptId, playerId, playerName, isPractice, isBot, valid, nRaw, nStrokes, durationMs, submittedAt, rawStrokes, pathStrokes }]
// returns [{ attemptId, accuracy, onLine, coverage, score, rank, roundPoints, guess: { shapeId, label, score } }]
async function saveAndScoreRound({ gameId, round, shapeId, attempts }) {
  if (!attempts.length) return [];
  const attemptRows = attempts.map((a) => [
    a.attemptId, gameId, round, a.playerId, shapeId, !!a.isBot,
    a.nRaw ?? null, a.nStrokes ?? null, a.durationMs ?? null, tsNtz(a.submittedAt),
    JSON.stringify(a.rawStrokes ?? []), a.playerName ?? null, !!a.isPractice,
  ]);
  await query(
    `INSERT INTO ATTEMPTS (attempt_id, game_id, round, player_id, shape_id, is_bot, n_raw_points, n_strokes,
       duration_ms, submitted_at, raw_strokes, player_name, is_practice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    attemptRows
  );

  const pointRows = [];
  for (const a of attempts) {
    if (!a.valid || !a.pathStrokes) continue;
    let idx = 0;
    a.pathStrokes.forEach((stroke, s) => {
      for (const [x, y] of stroke) pointRows.push([a.attemptId, idx++, s, x, y]);
    });
  }
  if (!pointRows.length) return [];
  await query('INSERT INTO ATTEMPT_POINTS (attempt_id, idx, stroke, x, y) VALUES (?, ?, ?, ?, ?)', pointRows);

  await query(SQL.score, [gameId, round]);
  const rows = await query(SQL.read, [gameId, round]);
  return rows.map((r) => ({
    attemptId: r.ATTEMPT_ID,
    accuracy: r.ACCURACY,
    onLine: r.ON_LINE,
    coverage: r.COVERAGE,
    score: r.FINAL_SCORE,
    rank: r.RANK_IN_ROUND,
    roundPoints: r.POINTS_AWARDED,
    guess: { shapeId: r.GUESS_SHAPE_ID, label: r.GUESS_LABEL, score: r.GUESS_SCORE },
  }));
}

// items: [{ attemptId, prompt }] -> { attemptId: text }. Up to 4 per statement; larger lists run in parallel chunks.
// SNOWFLAKE_MODEL empty (AI_COMPLETE is blocked on trial accounts) -> {} at once, backend uses canned lines.
async function comments(items) {
  const model = (process.env.SNOWFLAKE_MODEL || '').trim();
  if (!model || !items || !items.length) return {};
  if (!/^[a-z0-9.\-]+$/.test(model)) throw new Error('SNOWFLAKE_MODEL invalid');
  const out = {};
  const chunks = [];
  for (let i = 0; i < items.length; i += 4) chunks.push(items.slice(i, i + 4));
  await Promise.all(chunks.map(async (chunk) => {
    const values = chunk.map(() => '(?, ?)').join(', ');
    const binds = chunk.flatMap((it) => [it.attemptId, it.prompt]);
    const rows = await query(
      `SELECT column1 AS attempt_id, AI_COMPLETE('${model}', column2) AS comment FROM VALUES ${values}`,
      binds
    );
    for (const r of rows) out[r.ATTEMPT_ID] = r.COMMENT;
  }));
  return out;
}

// -> { attemptId: { beatPct, pool } }
async function percentiles({ shapeId, gameId, round }) {
  const rows = await query(SQL.percentiles, [shapeId, gameId, round]);
  const out = {};
  for (const r of rows) out[r.ATTEMPT_ID] = { beatPct: Number(r.BEAT_PCT), pool: Number(r.POOL_SIZE) };
  return out;
}

// -> [{ attemptId, pathStrokes }]
async function ghostPool({ shapeId, count }) {
  const limit = Math.max(1, Math.min(50, Math.floor(Number(count)) || 20));
  const rows = await query(SQL.ghostPool.replace('{{LIMIT}}', String(limit)), [shapeId]);
  return rows.map((r) => {
    const strokes = [];
    for (const [s, x, y] of parseMaybe(r.PTS)) (strokes[s] ||= []).push([x, y]);
    return { attemptId: r.ATTEMPT_ID, pathStrokes: strokes.filter(Boolean) };
  });
}

// gameStats({ gameId? }) -> plan/V3.md contract 4. Any field may be null.
// { totalAttempts, totalGames, hardestShape, bestEver: { name, score, shape }, steadiest: { name, tremor },
//   mostImproved: { name, gain }, confusion: { shape, label, pct }, perShape: [{ shape, avg, n }],
//   commonWrongGuess, avgByShape }   (last two kept for v2 callers)
// steadiest and mostImproved cover this game when gameId is given, otherwise all time.
async function gameStats({ gameId = null } = {}) {
  const g = gameId || null;
  const [[h], [best], [steady], [improved], [conf], byShape] = await Promise.all([
    query(SQL.stats[0]),
    query(SQL.stats[1]),
    query(SQL.stats[2], [g, g]),
    query(SQL.stats[3], [g, g]),
    query(SQL.stats[4]),
    query(SQL.stats[5]),
  ]);
  const perShape = byShape.map((r) => ({ shape: r.SHAPE, avg: r.AVG_SCORE, n: Number(r.N) }));
  const confusion = conf ? { shape: conf.SHAPE, label: conf.LABEL, pct: Number(conf.PCT) } : null;
  return {
    totalAttempts: Number(h.TOTAL_ATTEMPTS),
    totalGames: Number(h.TOTAL_GAMES),
    hardestShape: h.HARDEST_SHAPE,
    bestEver: best ? { name: best.NAME, score: best.SCORE, shape: best.SHAPE } : null,
    steadiest: steady ? { name: steady.NAME, tremor: steady.TREMOR } : null,
    mostImproved: improved ? { name: improved.NAME, gain: improved.GAIN } : null,
    confusion,
    perShape,
    commonWrongGuess: confusion ? confusion.label : null,
    avgByShape: perShape,
  };
}

function disconnect() {
  if (!conn) return Promise.resolve();
  const c = conn;
  conn = null;
  return new Promise((resolve) => c.destroy(() => resolve()));
}

module.exports = {
  init, ping, saveGame, saveAndScoreRound, comments, percentiles, ghostPool, gameStats,
  query, disconnect, statements,
};
