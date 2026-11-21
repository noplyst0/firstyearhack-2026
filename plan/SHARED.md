# SKYSKETCH v2: SHARED BRIEF
Read this, then your seat file in plan/.
FirstYearHack 2026 · Retro Remix track + Best Use of Snowflake · Freeze 17:00 · Draft 17:30 · Final 18:00
This replaces plan v1. Sections 0 and 4 are also in PLAN.md (copied to CLAUDE.md and AGENTS.md). If they ever differ, PLAN.md wins.

## 0. What changed from v1 (patch anything you already built)
1. Hold to draw: points are recorded only while a finger is on the phone screen. Lifting and pressing again starts a new stroke, so a drawing is a list of strokes. No clamp, no trim. The phone submits when the timer ends.
2. Smoothness is gone. Score = accuracy. Two sub-scores: onLine ("stayed on the line", from d1) and coverage ("covered the shape", from d2).
3. D_MAX default 0.35 (v1 had 0.5, where a random scribble scores about 55). Tune on real drawings.
4. Guess: every drawing is also scored against a shape library with decoys (egg, potato, spiral...). The best match gives "Snowflake thinks you drew an egg".
5. Bots are now ghosts: their drawings are real past attempts pulled from Snowflake, with generated ones as a fallback. Ghosts never get a rank, points or the win.
6. Percentile: "better than 78% of today's stars", worked out from every stored real attempt.
7. Join: players type a name or tap Generate. The JOIN tap also asks for motion permission. There's a name blocklist and a host kick button.
8. The last round is a memory round: the shape vanishes at GO.
9. round:results comes first. AI comments and percentiles follow a moment later in round:extras.
10. socket.io runs websocket only, on the server and every client.
11. Test games (load tests, parity tests) get game ids starting "TEST-" and never count in ghosts, percentiles or stats.

## 1. The game
A shape appears on the big screen. Everyone scans a QR code and joins on their phone. Players hold the phone upright like a camera, point it at the screen and hold a thumb down to draw in the air for 10 to 15 seconds. They never see their line. Snowflake scores every drawing against the target, guesses what it actually looks like, ranks the room and writes jokes for the top and bottom. The reveal goes from worst to best, winner last. 3 rounds (or 5), then a final leaderboard and stats.

## 2. Repo, seats and rules
| Seat | Folder | Branch | Spec |
|---|---|---|---|
| Claude Agent | backend/ | claude-backend | plan/backend.md |
| Argon | frontend/phone/ | argon-phone | plan/phone.md |
| Codex | frontend/host/ | codex-host | plan/host.md |
| Asim's Claude | ai/ | asim-ai | plan/ai.md |
| Neon | tools/, README.md | neon-misc | plan/spare.md |
| Lead (Faizan) | PLAN.md, TASKS.md, plan/, pitch/ | main | pitch/LEAD.md |
- Work on your own branch, push often. Only Faizan merges to main. Pull main after every merge.
- Never edit another seat's folder: write requests in TASKS.md.
- Secrets only in backend/.env (never committed).
- ai/ imports the maths from backend/scoreLocal.js and never copies it.
- After the 17:00 freeze, stretch work (plan/stretch.md) goes on `<your branch>-stretch`, for example claude-backend-stretch, so fixes on your seat branch can still merge without it.

## 3. Rounds and rules
- 3 rounds: circle 10 s, triangle 12 s, star 15 s. 5 rounds: circle 10, triangle 12, square 12, star 15, heart 15. The last round is the memory round.
- countdownMs 3000. A round ends at countdownMs + durationMs + 2000, or as soon as every connected real player has submitted.
- Points: 1st 300, 2nd 200, 3rd 100, every other valid real drawing 50, missing or invalid 0. Ghosts: no rank and 0 points.
- Ties: accuracy, then coverage, then earlier submit time.
- Valid drawing: at least 8 raw points in total, and an RMS radius of at least 0.02 (canvas units) after resampling.
- After START, joining is only allowed to reclaim your own slot (same playerId). Duplicate submit: keep the first.
- Host refresh: the room is kept for 60 s and host:create { code } reclaims it. Rooms are deleted after 1 hour idle.
- Limits: 150 players, 50 ghosts, 2000 points and 20 strokes per drawing. Names are 1 to 16 characters, HTML stripped, checked against the blocklist.

## 4. Realtime contract (socket.io, transports ['websocket'] on both sides)
Client to server:
| Event | Payload | Ack |
|---|---|---|
| host:create | { code?, test? } | { code, state } |
| host:start | { code, rounds: 3 or 5 } | |
| host:next | { code } (results to next round or final) | |
| host:again | { code } (back to lobby, same players, totals reset) | |
| host:kick | { code, playerId } | |
| host:bots | { code, count } (lobby only) | |
| player:join | { code, name, playerId? } | { ok, playerId, error? } |
| player:submit | { code, playerId, round, strokes: [[[x,y]...]...], points: [[x,y]...] } | |

Errors: ROOM_NOT_FOUND, ROOM_STARTED, ROOM_FULL, NAME_TAKEN, NAME_BLOCKED, NAME_INVALID.
points = strokes.flat(), kept so v1 code still works.

Server to clients:
| Event | Payload |
|---|---|
| lobby:update | { players: [{ id, name, isBot }] } |
| player:kicked | {} (only to the kicked phone) |
| round:start | { round, totalRounds, shapeId, shapeName, difficulty, targetStrokes, targetPoints, durationMs, countdownMs, memory, fov, smoothing } |
| round:progress | { round, submitted, total } |
| round:judging | { round, drawings, distanceChecks } |
| round:results | see below |
| round:extras | { round, comments?: { playerId: text }, percentiles?: { playerId: { beatPct, pool } }, heat?, crowd?, verdict?, vision? } (can arrive more than once: merge) |
| game:end | { leaderboard: [{ playerId, name, total }], stats } |

round:results = { round, shapeId, shapeName, targetNorm: [[x,y] x64], scorer: "snowflake" | "local", judgeMs, winner: { playerId, name, score } | null, results: [{ playerId, name, isBot, valid, score, accuracy, onLine, coverage, rank, roundPoints, totalPoints, guess: { shapeId, label, score } | null, comment, pathStrokes }] }
- Order: ranked real players, then invalid real players, then ghosts by score.
- comment is null for featured players (top 3 and last place). Their AI comment arrives in round:extras within 3.5 s, or a canned line if the AI is slow.
- targetStrokes and targetPoints use 0..1 canvas units (y down). targetNorm and pathStrokes are normalised (centre 0,0, RMS radius 1).

Stretch events (branches after 17:00 only): host:customShape { code, name, strokes } ack { ok, shapeId, guess } · host:snapshot { code, round, playerId, png } · player:shake { code, playerId } · room:shake { count, total, open }.

## 5. Scoring maths (backend/scoreLocal.js exports these; Snowflake must match within 0.1)
```js
const N = 64;
const len = s => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0]-s[i-1][0], s[i][1]-s[i-1][1]); return L; };

// one polyline -> n points evenly spaced by arc length (needs >= 2 points and length > 0)
function resample(p, n) {
  const seg = [0];
  for (let i = 1; i < p.length; i++) seg.push(seg[i-1] + Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]));
  const total = seg[seg.length - 1], out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = n === 1 ? 0 : (k / (n - 1)) * total;
    while (j < seg.length - 1 && seg[j] < target) j++;
    const t = Math.min(1, Math.max(0, (target - seg[j-1]) / ((seg[j] - seg[j-1]) || 1e-9)));
    out.push([p[j-1][0] + t * (p[j][0] - p[j-1][0]), p[j-1][1] + t * (p[j][1] - p[j-1][1])]);
  }
  return out;
}

// strokes -> strokes holding N points in total, shared by length (min 2 per stroke). null = no ink
function resampleStrokes(strokes, n = N) {
  const good = strokes.filter(s => Array.isArray(s) && s.length >= 2)
    .map(s => ({ s, L: len(s) })).filter(o => o.L > 1e-6)
    .sort((a, b) => b.L - a.L).slice(0, Math.floor(n / 2));
  if (!good.length) return null;
  const total = good.reduce((a, o) => a + o.L, 0);
  const counts = good.map(o => Math.max(2, Math.round(n * o.L / total)));
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
  const r = Math.sqrt(flat.reduce((a, p) => a + (p[0]-cx)**2 + (p[1]-cy)**2, 0) / m);
  if (!(r >= 0.02)) return null;
  return rs.map(s => s.map(p => [(p[0]-cx) / r, (p[1]-cy) / r]));
}

function avgNearest(from, to) {
  let sum = 0;
  for (const a of from) { let best = Infinity;
    for (const b of to) { const d = Math.hypot(a[0]-b[0], a[1]-b[1]); if (d < best) best = d; }
    sum += best; }
  return sum / from.length;
}

// att and tgt: 64 normalised points each (flat). Symmetric Chamfer distance.
function scoreAgainst(att, tgt, dMax) {
  const d1 = avgNearest(att, tgt);   // how far you strayed from the shape
  const d2 = avgNearest(tgt, att);   // how much of the shape you missed
  const pct = d => 100 * Math.max(0, 1 - d / dMax);
  return { accuracy: pct((d1 + d2) / 2), onLine: pct(d1), coverage: pct(d2) };
}

// best match in the library (sorted by id ascending; custom shapes 1000+ only count in their own round)
function guess(att, library, roundShapeId, dMax) {
  let best = null;
  for (const s of library) {
    if (s.id >= 1000 && s.id !== roundShapeId) continue;
    const a = scoreAgainst(att, s.norm, dMax).accuracy;
    if (!best || a > best.score) best = { shapeId: s.id, label: s.label, score: a };
  }
  return best;
}
// shown score = Math.round(accuracy * 10) / 10  (Snowflake: ROUND(accuracy, 1))
```
Constants (backend/constants.js AND the Snowflake CONFIG table, change both together): N 64, D_MAX 0.35, FOV 40 degrees (same for x and y), SMOOTHING 0.35, SAMPLE_MS 33.
Tune with 10 real drawings: careful trace 65 to 90, blind attempt 30 to 70, scribble under 30, straight line under 20, no movement invalid. Scribbles too high: lower D_MAX. Careful traces too low: raise it.

## 6. Shape library (ai/shapes.json from ai/make_shapes.js)
[{ id, name, label, difficulty, round, strokes, norm }]. strokes use 0..1 canvas units, for drawing. norm is 64 normalised points, for scoring.
Round shapes: 1 circle, 2 triangle, 3 square, 4 star, 5 heart. Decoys, used only for guesses: 10 egg, 11 pancake, 12 potato, 13 zigzag, 14 squiggle, 15 figure of eight, 16 spiral, 17 straight line, 18 house, 19 lightning bolt. Judge shapes (stretch) get id 1000+.

## 7. Timeline
- 13:50-14:35 build the MUST items (TASKS.md batch 3).
- 14:35-14:55 merge, then end-to-end on local scoring with 2 phones over the tunnel.
- 14:55-15:15 Snowflake scoring, guesses, comments and percentiles; failure drill; tune D_MAX.
- 15:15-17:00 3 phones × 3 rounds with no errors, deploy Render, tag demo-v1. FREEZE.

After 17:00, stretch branches only, in this order: room view, judge's shape, shake to clear, vision verdict.

Cut order if you're late (top of the list goes first): percentiles, AI comments (canned only), memory round, guess line, judging counts, Snowflake ghosts (keep the generated ones). Never cut: join, hold to draw, local scoring, reveal, leaderboard.
