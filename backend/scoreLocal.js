// Scoring maths (SHARED §5). ai/ imports this file, never copies it. Snowflake must match within 0.1.
const C = require('./constants');
const N = C.N;

const len = (s) => {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return L;
};

// one polyline -> n points evenly spaced by arc length (needs >= 2 points and length > 0)
function resample(p, n) {
  const seg = [0];
  for (let i = 1; i < p.length; i++) seg.push(seg[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = seg[seg.length - 1], out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = n === 1 ? 0 : (k / (n - 1)) * total;
    while (j < seg.length - 1 && seg[j] < target) j++;
    const t = Math.min(1, Math.max(0, (target - seg[j - 1]) / ((seg[j] - seg[j - 1]) || 1e-9)));
    out.push([p[j - 1][0] + t * (p[j][0] - p[j - 1][0]), p[j - 1][1] + t * (p[j][1] - p[j - 1][1])]);
  }
  return out;
}

// strokes -> strokes holding N points in total, shared by length (min 2 per stroke). null = no ink
function resampleStrokes(strokes, n = N) {
  const good = strokes.filter((s) => Array.isArray(s) && s.length >= 2)
    .map((s) => ({ s, L: len(s) })).filter((o) => o.L > 1e-6)
    .sort((a, b) => b.L - a.L).slice(0, Math.floor(n / 2));
  if (!good.length) return null;
  const total = good.reduce((a, o) => a + o.L, 0);
  const counts = good.map((o) => Math.max(2, Math.round((n * o.L) / total)));
  let diff = n - counts.reduce((a, c) => a + c, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % counts.length) {
    if (diff > 0) { counts[i]++; diff--; } else if (counts[i] > 2) { counts[i]--; diff++; }
  }
  return good.map((o, i) => resample(o.s, counts[i]));
}

// centre on (0,0), scale to RMS radius 1, so position and size stop mattering. null = barely moved
function normaliseStrokes(rs) {
  const flat = rs.flat(), m = flat.length;
  const cx = flat.reduce((a, p) => a + p[0], 0) / m, cy = flat.reduce((a, p) => a + p[1], 0) / m;
  const r = Math.sqrt(flat.reduce((a, p) => a + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / m);
  if (!(r >= 0.02)) return null;
  return rs.map((s) => s.map((p) => [(p[0] - cx) / r, (p[1] - cy) / r]));
}

function avgNearest(from, to) {
  let sum = 0;
  for (const a of from) {
    let best = Infinity;
    for (const b of to) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < best) best = d; }
    sum += best;
  }
  return sum / from.length;
}

// att and tgt: 64 normalised points each (flat). Symmetric Chamfer distance.
function scoreAgainst(att, tgt, dMax = C.D_MAX) {
  const d1 = avgNearest(att, tgt); // how far you strayed from the shape
  const d2 = avgNearest(tgt, att); // how much of the shape you missed
  const pct = (d) => 100 * Math.max(0, 1 - d / dMax);
  return { accuracy: pct((d1 + d2) / 2), onLine: pct(d1), coverage: pct(d2) };
}

// best match in the library (sorted by id ascending; custom shapes 1000+ only count in their own round)
function guess(att, library, roundShapeId, dMax = C.D_MAX) {
  let best = null;
  for (const s of library) {
    if (s.id >= 1000 && s.id !== roundShapeId) continue;
    const a = scoreAgainst(att, s.norm, dMax).accuracy;
    if (!best || a > best.score) best = { shapeId: s.id, label: s.label, score: a };
  }
  return best;
}

const round1 = (v) => Math.round(v * 10) / 10;

// raw strokes -> { valid, pathStrokes (normalised, 64 points in total) }
function processDrawing(strokes, nRaw) {
  if (!Array.isArray(strokes)) return { valid: false, pathStrokes: null };
  const raw = nRaw != null ? nRaw : strokes.reduce((a, s) => a + (Array.isArray(s) ? s.length : 0), 0);
  if (raw < C.MIN_RAW_POINTS) return { valid: false, pathStrokes: null };
  const rs = resampleStrokes(strokes);
  const norm = rs && normaliseStrokes(rs);
  return norm ? { valid: true, pathStrokes: norm } : { valid: false, pathStrokes: null };
}

const timeOf = (t) => (typeof t === 'number' ? t : t ? Date.parse(t) : Infinity);

// Sets rank and roundPoints. Only valid real drawings rank. Ties: accuracy, coverage, earlier submit.
function rankAttempts(items) {
  const ranked = items.filter((a) => a.valid && !a.isBot)
    .sort((a, b) => b.accuracy - a.accuracy || b.coverage - a.coverage || timeOf(a.submittedAt) - timeOf(b.submittedAt));
  for (const a of items) { a.rank = null; a.roundPoints = 0; }
  ranked.forEach((a, i) => {
    a.rank = i + 1;
    a.roundPoints = i < C.ROUND_POINTS.length ? C.ROUND_POINTS[i] : C.OTHER_POINTS;
  });
  return items;
}

// attempts: [{ attemptId, isBot, valid, submittedAt, pathStrokes }] (same shape saveAndScoreRound takes)
// -> rows for valid attempts: [{ attemptId, accuracy, onLine, coverage, score, rank, roundPoints, guess }]
function scoreRoundLocal(attempts, shapeId, library, dMax = C.D_MAX) {
  const target = library.find((s) => s.id === shapeId);
  if (!target) throw new Error('unknown shape ' + shapeId);
  const rows = [];
  for (const a of attempts) {
    if (!a.valid || !a.pathStrokes) continue;
    const att = a.pathStrokes.flat();
    const s = scoreAgainst(att, target.norm, dMax);
    rows.push({
      attemptId: a.attemptId, isBot: !!a.isBot, valid: true, submittedAt: a.submittedAt,
      accuracy: s.accuracy, onLine: s.onLine, coverage: s.coverage, score: round1(s.accuracy),
      guess: guess(att, library, shapeId, dMax),
    });
  }
  rankAttempts(rows);
  return rows.map(({ attemptId, accuracy, onLine, coverage, score, rank, roundPoints, guess: g }) =>
    ({ attemptId, accuracy, onLine, coverage, score, rank, roundPoints, guess: g }));
}

module.exports = {
  N, len, resample, resampleStrokes, normaliseStrokes, avgNearest, scoreAgainst, guess,
  round1, processDrawing, rankAttempts, scoreRoundLocal,
};
