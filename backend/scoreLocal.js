// Scoring maths (SHARED §5). ai/ imports this file, never copies it. Snowflake must match within 0.1.
const C = require('./constants');
const N = C.N;
const TARGET_N = 256; // target scoring points; attempts stay at N (64)

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

// A target's scoring points: its strokes resampled to 256 points and normalised, flat.
// Built from shape.strokes (never shapes.json norm) so a 64-point attempt can't line up with, or fall between,
// a 64-point target and swing the score by up to 14 points depending on where the player started.
// Snowflake TARGET_POINTS must hold these same 256 points.
const targetCache = new WeakMap();
function targetBuild(shape) {
  let t = targetCache.get(shape);
  if (!t) {
    const rs = resampleStrokes(shape.strokes, TARGET_N);
    const norm = rs && normaliseStrokes(rs);
    if (!norm) throw new Error(`shape ${shape.id} has no usable strokes`);
    const r4 = (v) => Math.round(v * 10000) / 10000;
    t = { flat: norm.flat(), strokes: norm.map((s) => s.map(([x, y]) => [r4(x), r4(y)])) };
    targetCache.set(shape, t);
  }
  return t;
}
const targetPoints = (shape) => targetBuild(shape).flat;
// same 256 points kept per stroke (rounded), so multi-stroke shapes draw without bridging lines
const targetNormStrokes = (shape) => targetBuild(shape).strokes;

// best match in the library (sorted by id ascending; custom shapes 1000+ only count in their own round)
function guess(att, library, roundShapeId, dMax = C.D_MAX) {
  let best = null;
  for (const s of library) {
    if (s.id >= 1000 && s.id !== roundShapeId) continue;
    const a = scoreAgainst(att, targetPoints(s), dMax).accuracy;
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
    const s = scoreAgainst(att, targetPoints(target), dMax);
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

// Room View (V3), same idea as ai/sql/room_view.sql: for each of the 256 target points, every drawing's nearest
// point (MIN_BY). heat = average miss distance per target point scaled to 0..1 (1 = the room missed it most);
// crowd = the average of those nearest points, a consensus line, scored like a drawing; alone = average room score.
// paths: [flat 64 normalised points] for each valid real drawing. Needs at least 2.
function roomViewLocal(shape, paths, scores, dMax = C.D_MAX) {
  if (!paths || paths.length < 2) return null;
  const tgt = targetPoints(shape);
  const sumD = new Array(tgt.length).fill(0), cx = new Array(tgt.length).fill(0), cy = new Array(tgt.length).fill(0);
  for (const att of paths) {
    tgt.forEach((t, j) => {
      let best = Infinity, bx = 0, by = 0;
      for (const p of att) { const d = Math.hypot(p[0] - t[0], p[1] - t[1]); if (d < best) { best = d; bx = p[0]; by = p[1]; } }
      sumD[j] += best; cx[j] += bx; cy[j] += by;
    });
  }
  const n = paths.length;
  const miss = sumD.map((d) => d / n);
  const max = Math.max(...miss) || 1;
  const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 10000) / 10000;
  const path = cx.map((x, j) => [r4(x / n), r4(cy[j] / n)]);
  // split the consensus line by the target's strokes so it can be scored and drawn without bridges
  const strokes = [];
  let k = 0;
  for (const s of targetNormStrokes(shape)) { strokes.push(path.slice(k, k + s.length)); k += s.length; }
  const d = processDrawing(strokes, path.length);
  const score = d.valid ? round1(scoreAgainst(d.pathStrokes.flat(), tgt, dMax).accuracy) : 0;
  const alone = scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  return { heat: miss.map((m) => r3(m / max)), crowd: { path, score }, alone };
}

// Tremor (V3 "steadiest hands"), like the LAG/ATAN2 SQL: standard deviation of the turning angle between
// consecutive segments of each stroke, in degrees. Lower = steadier. null when there are too few segments.
function tremor(pathStrokes) {
  const turns = [];
  for (const s of pathStrokes || []) {
    let prev = null;
    for (let i = 1; i < s.length; i++) {
      const dx = s[i][0] - s[i - 1][0], dy = s[i][1] - s[i - 1][1];
      if (Math.hypot(dx, dy) < 1e-9) continue;
      const a = Math.atan2(dy, dx);
      if (prev !== null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turns.push(d); }
      prev = a;
    }
  }
  if (turns.length < 3) return null;
  const m = turns.reduce((x, y) => x + y, 0) / turns.length;
  const sd = Math.sqrt(turns.reduce((x, y) => x + (y - m) ** 2, 0) / (turns.length - 1));
  return round1((sd * 180) / Math.PI);
}

module.exports = {
  roomViewLocal, tremor,
  N, TARGET_N, targetPoints, targetNormStrokes, len, resample, resampleStrokes, normaliseStrokes, avgNearest, scoreAgainst, guess,
  round1, processDrawing, rankAttempts, scoreRoundLocal,
};
