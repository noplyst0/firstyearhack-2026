// Shape library. Loads ai/shapes.json; until it lands, builds the same shapes inline (plan/ai.md §3).
const fs = require('fs');
const path = require('path');
const { resampleStrokes, normaliseStrokes, targetPoints } = require('./scoreLocal');

const RAW = 400;
const TAU = 2 * Math.PI;
const r4 = (v) => Math.round(v * 10000) / 10000;

function param(fn, t0, t1, closed) {
  const pts = [];
  for (let i = 0; i < RAW; i++) pts.push(fn(t0 + ((t1 - t0) * i) / (RAW - 1)));
  if (closed) pts[RAW - 1] = pts[0].slice();
  return pts;
}
const poly = (pts, closed) => (closed ? [...pts, pts[0]] : pts).map((p) => p.slice());

function heart() {
  const raw = param((t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))], 0, TAU, true);
  const xs = raw.map((p) => p[0]), ys = raw.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = 0.8 / Math.max(x1 - x0, y1 - y0);
  return raw.map(([x, y]) => [0.5 + (x - (x0 + x1) / 2) * k, 0.5 + (y - (y0 + y1) / 2) * k]);
}

function star() {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + 36 * i) * Math.PI) / 180, r = i % 2 ? 0.16 : 0.4;
    v.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
  }
  return poly(v, true);
}

const ellipse = (rx, ry) => param((t) => [0.5 + rx * Math.cos(t), 0.5 + ry * Math.sin(t)], 0, TAU, true);

const DEFS = [
  [1, 'circle', 'a circle', 1, () => ellipse(0.4, 0.4)],
  [2, 'triangle', 'a triangle', 2, () => poly([[0.5, 0.12], [0.88, 0.78], [0.12, 0.78]], true)],
  [3, 'square', 'a square', 2, () => poly([[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]], true)],
  [4, 'star', 'a star', 3, star],
  [5, 'heart', 'a heart', 3, heart],
  [10, 'egg', 'an egg', 0, () => ellipse(0.3, 0.4)],
  [11, 'pancake', 'a pancake', 0, () => ellipse(0.42, 0.14)],
  [12, 'potato', 'a potato', 0, () => param((t) => {
    const r = 0.33 * (1 + 0.12 * Math.sin(3 * t) + 0.08 * Math.cos(5 * t));
    return [0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)];
  }, 0, TAU, true)],
  [13, 'zigzag', 'a zigzag', 0, () => poly([[0.1, 0.7], [0.3, 0.3], [0.5, 0.7], [0.7, 0.3], [0.9, 0.7]], false)],
  [14, 'squiggle', 'a squiggle', 0, () => param((t) => [0.1 + 0.8 * t, 0.5 + 0.15 * Math.sin(6 * Math.PI * t)], 0, 1, false)],
  [15, 'figure of eight', 'a figure of eight', 0, () => param((t) => [0.5 + 0.25 * Math.sin(2 * t), 0.5 + 0.4 * Math.sin(t)], 0, TAU, true)],
  [16, 'spiral', 'a spiral', 0, () => param((t) => {
    const r = 0.04 + (0.36 * t) / (6 * Math.PI), a = t - Math.PI / 2;
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
  }, 0, 6 * Math.PI, false)],
  [17, 'straight line', 'a straight line', 0, () => poly([[0.15, 0.5], [0.85, 0.5]], false)],
  [18, 'house', 'a house', 0, () => poly([[0.2, 0.85], [0.2, 0.5], [0.5, 0.15], [0.8, 0.5], [0.8, 0.85]], true)],
  [19, 'lightning bolt', 'a lightning bolt', 0, () => poly([[0.55, 0.08], [0.25, 0.55], [0.47, 0.55], [0.4, 0.92], [0.75, 0.4], [0.52, 0.4]], true)],
];

function buildInline() {
  return DEFS.map(([id, name, label, difficulty, make]) => {
    const strokes = [make().map((p) => [r4(p[0]), r4(p[1])])];
    const norm = normaliseStrokes(resampleStrokes(strokes)).flat();
    return { id, name, label, difficulty, round: id <= 5, strokes, norm };
  });
}

function loadLibrary() {
  const file = path.join(__dirname, '..', 'ai', 'shapes.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ok = Array.isArray(data) && data.length && data.every((s) =>
      Number.isInteger(s.id) && Array.isArray(s.strokes) && Array.isArray(s.norm) && s.norm.length === 64);
    if (ok) return { library: data.slice().sort((a, b) => a.id - b.id), source: 'ai/shapes.json' };
    console.warn('ai/shapes.json has the wrong shape, using inline shapes');
  } catch (_) { /* not there yet */ }
  return { library: buildInline(), source: 'inline' };
}

const { library, source } = loadLibrary();
// build every target's 256 scoring points once at startup (norm stays 64 points, for display and ghosts)
for (const s of library) targetPoints(s);
const byId = (id) => library.find((s) => s.id === id) || null;

// SHARED §3: 3 rounds circle/triangle/star, 5 rounds add square and heart. Last round is the memory round.
// V3: index 0 is the practice round (circle, 10 s, no points); real rounds are 1..rounds.
function roundPlan(rounds) {
  const steps = rounds === 5
    ? [[1, 10000], [2, 12000], [3, 12000], [4, 15000], [5, 15000]]
    : rounds === 2
      ? [[3, 12000], [4, 15000]]   // demo: square, star (after the practice circle)
      : [[1, 10000], [2, 12000], [4, 15000]];
  return [{ shapeId: 1, durationMs: 10000, practice: true }, ...steps.map(([shapeId, durationMs]) => ({ shapeId, durationMs, practice: false }))];
}

module.exports = { library, source, byId, roundPlan, buildInline };
