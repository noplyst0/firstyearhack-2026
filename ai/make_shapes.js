// Builds ai/shapes.json: [{ id, name, label, difficulty, round, strokes, norm }] sorted by id.
// strokes: 0..1 canvas units (y down), for drawing. norm: 64 normalised points (centre 0,0, RMS radius 1), for scoring.
// Maths comes from backend/scoreLocal.js (never copied here). Override the path with SCORE_LOCAL=/path/to/scoreLocal.js.
// Run: node make_shapes.js
const fs = require('fs');
const path = require('path');

const scorePath = process.env.SCORE_LOCAL || path.join(__dirname, '..', 'backend', 'scoreLocal.js');
const { resampleStrokes, normaliseStrokes } = require(scorePath);

const RAW = 400; // points per parametric shape
const TAU = 2 * Math.PI;

// closed parametric curve over t in [0, 2π]: last point equals first
const closed = (f) => Array.from({ length: RAW }, (_, i) => f((TAU * i) / (RAW - 1)));
// open parametric curve over t in [a, b]
const open = (f, a, b) => Array.from({ length: RAW }, (_, i) => f(a + ((b - a) * i) / (RAW - 1)));
// polygon through vertices; closed ones end on their first point
const poly = (v, isClosed) => (isClosed ? [...v, v[0]] : v);

function heart() {
  const pts = closed((t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const s = 0.8 / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pts.map(([x, y]) => [0.5 + (x - cx) * s, 0.5 + (y - cy) * s]);
}

function star() {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.4 : 0.16;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    v.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
  }
  return poly(v, true);
}

// Snowflake: 3 crossed axes (3 strokes) + a V-shaped branch near each of the 6 tips (6 strokes) = 9 strokes
function snowflakeShape() {
  const c = 0.5, R = 0.4, at = (r, deg) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
  const strokes = [90, 30, 150].map((a) => [at(R, a + 180), at(R, a)]);
  for (let k = 0; k < 6; k++) {
    const a = -90 + 60 * k, base = at(0.27, a), len = 0.11;
    const side = (sgn) => [base[0] + len * Math.cos(((a + sgn * 45) * Math.PI) / 180), base[1] + len * Math.sin(((a + sgn * 45) * Math.PI) / 180)];
    strokes.push([side(-1), base, side(1)]);
  }
  return strokes;
}

// Smiley: face circle, two big eye circles, wide smile arc = 4 strokes.
// Eyes r 0.1 and a 164-degree smile r 0.3: smaller features read as "a spiral" under noise (backend test 6).
function smileyShape() {
  const circ = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => {
    const t = (TAU * i) / (n - 1); return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
  const mouth = Array.from({ length: 120 }, (_, i) => {
    const t = ((8 + (164 * i) / 119) * Math.PI) / 180; return [0.5 + 0.3 * Math.cos(t), 0.45 + 0.3 * Math.sin(t)];
  });
  return [circ(0.5, 0.5, 0.4, RAW), circ(0.37, 0.37, 0.035, 60), circ(0.63, 0.37, 0.035, 60), mouth];   // dot eyes
}

const ellipse = (rx, ry) => closed((t) => [0.5 + rx * Math.cos(t), 0.5 + ry * Math.sin(t)]);

// [id, name, label, difficulty, raw points (one stroke) or { strokes } (multi-stroke)]
const DEFS = [
  [1, 'circle', 'a circle', 1, ellipse(0.4, 0.4)],
  [2, 'triangle', 'a triangle', 2, poly([[0.5, 0.12], [0.88, 0.78], [0.12, 0.78]], true)],
  [3, 'square', 'a square', 2, poly([[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]], true)],
  [4, 'star', 'a star', 3, star()],
  [5, 'heart', 'a heart', 3, heart()],
  [6, 'snowflake', 'a snowflake', 4, { strokes: snowflakeShape() }],
  [7, 'smiley', 'a smiley face', 4, { strokes: smileyShape() }],
  [10, 'egg', 'an egg', 0, ellipse(0.3, 0.4)],
  [11, 'pancake', 'a pancake', 0, ellipse(0.42, 0.14)],
  [12, 'potato', 'a potato', 0, closed((t) => {
    const r = 0.33 * (1 + 0.12 * Math.sin(3 * t) + 0.08 * Math.cos(5 * t));
    return [0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)];
  })],
  [13, 'zigzag', 'a zigzag', 0, poly([[0.1, 0.7], [0.3, 0.3], [0.5, 0.7], [0.7, 0.3], [0.9, 0.7]], false)],
  [14, 'squiggle', 'a squiggle', 0, open((t) => [0.1 + 0.8 * t, 0.5 + 0.15 * Math.sin(6 * Math.PI * t)], 0, 1)],
  [15, 'figure of eight', 'a figure of eight', 0, closed((t) => [0.5 + 0.25 * Math.sin(2 * t), 0.5 + 0.4 * Math.sin(t)])],
  [16, 'spiral', 'a spiral', 0, open((t) => {
    const r = 0.04 + (0.36 * t) / (6 * Math.PI), a = t - Math.PI / 2;
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
  }, 0, 6 * Math.PI)],
  [17, 'straight line', 'a straight line', 0, [[0.15, 0.5], [0.85, 0.5]]],
  [18, 'house', 'a house', 0, poly([[0.2, 0.85], [0.2, 0.5], [0.5, 0.15], [0.8, 0.5], [0.8, 0.85]], true)],
  [19, 'lightning bolt', 'a lightning bolt', 0, poly([[0.55, 0.08], [0.25, 0.55], [0.47, 0.55], [0.4, 0.92], [0.75, 0.4], [0.52, 0.4]], true)],
];

const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const shapes = DEFS.map(([id, name, label, difficulty, def]) => {
  const rawStrokes = Array.isArray(def) ? [def] : def.strokes;
  for (const [x, y] of rawStrokes.flat()) if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new Error(`${name} leaves 0..1: ${x},${y}`);
  const strokes = rawStrokes.map((st) => st.map(([x, y]) => [r(x, 4), r(y, 4)]));
  const rs = resampleStrokes(strokes);
  const ns = rs && normaliseStrokes(rs);
  if (!ns) throw new Error(`${name}: could not normalise`);
  const norm = ns.flat().map(([x, y]) => [r(x, 5), r(y, 5)]);
  if (norm.length !== 64) throw new Error(`${name}: norm has ${norm.length} points`);
  return { id, name, label, difficulty, round: id >= 1 && id <= 9, strokes, norm };
}).sort((a, b) => a.id - b.id);

fs.writeFileSync(path.join(__dirname, 'shapes.json'), JSON.stringify(shapes) + '\n');
console.log(`wrote ${shapes.length} shapes:`, shapes.map((s) => `${s.id} ${s.name}`).join(', '));
