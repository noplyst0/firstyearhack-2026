# SEAT: BACKEND · Claude Agent · folder backend/ · branch claude-backend
Read plan/SHARED.md first. You own the server, the game loop, scoreLocal.js and every fallback.

## Files
server.js, game.js, scoreLocal.js (SHARED §5 + scoreRoundLocal), constants.js, names.js, blocklist.txt, canned.js, ghosts.js, data/ (gitignored), test/score.test.js, .env.example, package.json.
.env.example: SNOWFLAKE_ENABLED=1, SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY_PATH, SNOWFLAKE_ROLE, SNOWFLAKE_WAREHOUSE=SKY_WH, SNOWFLAKE_DATABASE=SKYSKETCH, SNOWFLAKE_SCHEMA=GAME, SNOWFLAKE_MODEL, SNOWFLAKE_VISION_MODEL.
SNOWFLAKE_ENABLED=0 forces local mode (failure drill and demo emergencies).

## 1. Server
- Express + socket.io v4 with transports ['websocket'].
- Static files: / -> frontend/phone, /host -> frontend/host, resolved with path.join(__dirname, '..', 'frontend', ...) so Render works. Listen on process.env.PORT || 3000.
- Load ai/shapes.json at startup. Until it lands, build circle, triangle and star inline from SHARED §6.
- GET /health -> { ok, snowflake: "ok" | "down" | "off", lastScorer, rooms }.
- Room codes: 4 letters from BCDFGHJKLMNPQRSTVWXZ (no vowels, so no rude words on the big screen).
- host:create { test: true } -> gameId "TEST-<uuid>", otherwise "<uuid>". Call snowflake.saveGame fire and forget.
- One log line per event: join, kick, start, submit (points, strokes), scorer used, judge ms, errors.

## 2. Game loop
States: LOBBY -> ROUND_ACTIVE -> JUDGING -> RESULTS -> ... -> GAME_END. Rules and events are exactly SHARED §3 and §4.
- round:start: targetStrokes from shapes.json, targetPoints = targetStrokes.flat(), memory = true on the last round, fov and smoothing from constants.
- Each submit: validate (state, round, known player, not a duplicate, finite numbers, at most 2000 points and 20 strokes). Store it with receivedAt, emit round:progress, and end the round early once every connected real player has submitted.
- At round start, fetch the ghost pool for that shape in the background (§4).

## 3. Judging pipeline (each round)
1. Each real submission: resampleStrokes -> normaliseStrokes. null, or fewer than 8 raw points, = invalid (score 0, no rank, canned invalid comment).
2. Add one ghost drawing per bot.
3. Emit round:judging { drawings: valid count, distanceChecks: valid × 64 × 64 × library size }.
4. Promise.race([snowflake.saveAndScoreRound(...), timeout(4000)]). If Snowflake loses, throws or returns fewer rows than there are valid drawings, run scoreRoundLocal on the same paths and set scorer "local". Let a slow Snowflake call finish in the background so the data still lands.
   Pass each attempt's real receivedAt as submittedAt. One bulk insert would otherwise give every row the same timestamp and break the tie-break.
5. Emit round:results: comment null for featured players, canned lines for everyone else.
6. In parallel, run snowflake.comments for featured players (3 s) and snowflake.percentiles (1.5 s). Send one round:extras holding both within 3.5 s, using a canned line for any comment that timed out. Percentile stays null unless the pool has at least 20 attempts. Strip quotes from AI comments, cut them to 120 characters and run them through the blocklist (a hit means canned instead).
7. Append every valid real attempt to data/attempts.jsonl { gameId, round, shapeId, pathStrokes, score, at }, skipping TEST games. This is the ghost and percentile pool when Snowflake is down.
8. RESULTS: auto-advance after 15 s, or on host:next.

## 4. Ghosts (host:bots)
- Names "Ghost 1".."Ghost N", isBot true, no socket.
- Each round every ghost draws, in order of preference:
  1. a stored real attempt from snowflake.ghostPool({ shapeId, count }) (2 s timeout)
  2. else one from data/attempts.jsonl
  3. else fakeAttempt.

  Never use the same stored attempt twice in one round.
```js
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
  return [pts];   // one stroke: resample + normalise it like a real drawing
}
```

## 5. Names, kick, reconnect
- Sanitise: trim, strip HTML and control characters, require 1 to 16 characters, otherwise NAME_INVALID.
- Blocklist: the obscenity npm package (englishDataset + englishRecommendedTransformers, which handles leetspeak), plus blocklist.txt for extra words -> NAME_BLOCKED.
- host:kick: emit player:kicked to that socket, disconnect it, remove the player, emit lobby:update.
- player:join with a known playerId whose socket has gone: rebind in any state, then resend the room's last broadcast to that phone.
- host:create { code } for a room with no host: rebind, then resend the last broadcast.
- host:again: reset totals, state back to LOBBY, same code and players.

## 6. Comments
Featured = ranks 1, 2 and 3, plus the last valid real player when there are 4 or more. Prompt for each featured player:
"You are the funny host of a party game where players trace a shape in the air with their phones without seeing their line. Write ONE short comment (maximum 14 words) about this player's attempt. Be playful and kind. No insults about people, no swearing, no names. Facts: shape = {shape}; rank = {rank} of {n}; score = {score}%; stayed on the line = {onLine}%; covered the shape = {coverage}%; it looked most like {guessLabel}; notes = {notes}. Return only the comment."
notes: "only drew part of the shape" if coverage < onLine - 20; "wandered off the line" if onLine < coverage - 20.
canned.js (add more, keep them kind):
- 75+: "Steady hands. Surgeon or wizard?" · "Suspiciously good." · "Frame it."
- 45-74: "Recognisable. Mostly." · "Close enough for a party." · "We see the vision."
- 15-44: "Bold reinterpretation." · "That shape has been through something." · "Picasso would be proud. Or confused."
- under 15: "Were you swatting a fly?" · "The sky is still recovering." · "Modern art. Very modern."
- invalid: "Did you fall asleep?" · "Your pen never touched the sky."

## 7. Game end
Leaderboard: real players by total; ties go to the best single score. stats = snowflake.gameStats() (2 s timeout), otherwise this game's own numbers. Emit game:end.

## 8. Keep Snowflake warm
While any room has a connected host, call snowflake.ping() every 45 s. Log Snowflake errors and never crash on them.

## 9. Tests (node --test test/score.test.js)
1. Every round shape scored against itself: at least 98.
2. Circle shifted and scaled ×2: within 1 point of test 1.
3. Circle attempt on the triangle target: at least 25 points below test 1, and the guess is circle.
4. Straight line on the circle: under 20. Five identical points: invalid.
5. Random scribble (300 random points in 0..1) on the circle: print the score, for D_MAX tuning.
6. Every library shape plus noise σ 0.03 guesses itself (report any failing pair to ai/ in TASKS.md).
7. Circle with 3 small gaps (3% of the outline each), sent as 3 strokes: within 2 points of the single stroke.
8. Duplicate submit is ignored. Missing submit = 0 points.

## Done when
Unit tests pass. Neon's tools/loadtest.js plays 3 rounds with 30 players through the public URL and every round:results is correct. With SNOWFLAKE_ENABLED=0, or a wrong password, rounds still finish with scorer "local".
