// Stub target shapes until ai/shapes.json lands. Each shape is 64 [x, y] points in 0..1.
const fs = require('fs');
const path = require('path');

const N = 64;

function circle() {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    pts.push([round(0.5 + 0.4 * Math.cos(t)), round(0.5 + 0.4 * Math.sin(t))]);
  }
  return pts;
}

function round(v) {
  return Math.round(v * 10000) / 10000;
}

// Prefer the shared shapes file from the ai/ seat if it exists.
function loadShapes() {
  const file = path.join(__dirname, '..', 'ai', 'shapes.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && Array.isArray(data.circle)) return data;
  } catch (_) {
    // not there yet, use the stub
  }
  return { circle: circle() };
}

module.exports = { loadShapes };
