// data/attempts.jsonl: every valid real attempt (never TEST games). Ghost and percentile pool when Snowflake is down.
const fs = require('fs');
const path = require('path');
const C = require('./constants');

const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'attempts.jsonl');
let rows = [];

function load() {
  try {
    rows = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch (_) { return null; }
    }).filter((r) => r && r.gameId && !String(r.gameId).startsWith('TEST-'));
  } catch (_) { rows = []; }
  return rows.length;
}

function append(recs) {
  const keep = recs.filter((r) => !String(r.gameId).startsWith('TEST-'));
  if (!keep.length) return;
  rows.push(...keep);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(FILE, keep.map((r) => JSON.stringify(r)).join('\n') + '\n');
  } catch (e) { console.error('attempts.jsonl write failed:', e.message); }
}

const today = () => new Date().toISOString().slice(0, 10);

function ghostPool(shapeId) {
  return rows.filter((r) => r.shapeId === shapeId).map((r, i) => ({ attemptId: `file-${r.gameId}-${r.round}-${i}`, pathStrokes: r.pathStrokes }));
}

// scores: { playerId: score } -> { playerId: { beatPct, pool } } against today's stored attempts on this shape
function percentiles(shapeId, scores) {
  const day = today();
  const pool = rows.filter((r) => r.shapeId === shapeId && String(r.at).slice(0, 10) === day).map((r) => r.score);
  if (pool.length < C.PERCENTILE_MIN_POOL) return {};
  const out = {};
  for (const [pid, s] of Object.entries(scores)) {
    out[pid] = { beatPct: Math.round((100 * pool.filter((p) => p < s).length) / pool.length), pool: pool.length };
  }
  return out;
}

module.exports = { load, append, ghostPool, percentiles, FILE };
