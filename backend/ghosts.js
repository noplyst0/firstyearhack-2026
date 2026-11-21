// Ghost drawings: stored real attempts first (Snowflake, then data/attempts.jsonl), generated ones last.
function gauss() { return Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random()); }

// human-ish fake from a target's 64 normalised points; skill 0 = awful, 1 = great
function fakeAttempt(norm, skill = Math.random()) {
  const w = 1 - skill, rot = (Math.random() - 0.5) * 0.6 * w;
  const sx = 1 + (Math.random() - 0.5) * 0.6 * w, sy = 1 + (Math.random() - 0.5) * 0.6 * w;
  const n = Math.max(8, Math.round(norm.length * (0.6 + 0.4 * skill)));
  const start = Math.floor(Math.random() * norm.length), noise = 0.02 + 0.15 * w, pts = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = norm[(start + i) % norm.length];
    pts.push([(x * Math.cos(rot) - y * Math.sin(rot)) * sx + gauss() * noise,
      (x * Math.sin(rot) + y * Math.cos(rot)) * sy + gauss() * noise]);
  }
  return [pts]; // one stroke: resample + normalise it like a real drawing
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// sources: [{ attemptId, pathStrokes }] lists in order of preference. Never reuses an attempt in one round.
function pickDrawings(count, sources, norm) {
  const used = new Set(), out = [];
  const queue = sources.map((list) => shuffle((list || []).filter((x) => x && Array.isArray(x.pathStrokes))));
  for (let i = 0; i < count; i++) {
    let pick = null;
    for (const [k, list] of queue.entries()) {
      while (list.length && !pick) {
        const c = list.pop();
        if (!used.has(c.attemptId)) { used.add(c.attemptId); pick = { strokes: c.pathStrokes, source: k === 0 ? 'snowflake' : 'file' }; }
      }
      if (pick) break;
    }
    out.push(pick || { strokes: fakeAttempt(norm), source: 'fake' });
  }
  return out;
}

module.exports = { gauss, fakeAttempt, pickDrawings };
