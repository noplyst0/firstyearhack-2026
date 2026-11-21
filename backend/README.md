# backend

One Node server (Express + socket.io, websocket only) for SkySketch. Contract: SHARED §4 / PLAN.md.

```
cd backend
npm install
SNOWFLAKE_ENABLED=0 npm start   # local scoring only. http://localhost:3000 phone at /, host at /host
npm test                        # unit tests (scoring) + game loop over real sockets + Snowflake fallback
cloudflared tunnel --url http://localhost:3000   # HTTPS for phones (iOS motion needs it)
```
Snowflake: copy `.env.example` to `.env` and fill it in. `SNOWFLAKE_ENABLED=0` forces local mode (failure drill).
`GET /health` -> `{ ok, snowflake: "ok" | "down" | "off", lastScorer, rooms }`.

## Files
| File | What |
|---|---|
| server.js | static pages, /health, starts the game |
| game.js | rooms, game loop, judging pipeline, every socket event |
| scoreLocal.js | SHARED §5 maths + processDrawing, rankAttempts, scoreRoundLocal (ai/ imports this) |
| constants.js | N, D_MAX (env `D_MAX` overrides for tuning), FOV, SMOOTHING, timings, limits |
| shapes.js | loads ai/shapes.json, else builds the same 15 shapes inline; round plans |
| sf.js | bridge to ai/snowflake.js with timeouts and ok/down/off status |
| ghosts.js | fakeAttempt + picking stored drawings (Snowflake, then file, then fake) |
| store.js | data/attempts.jsonl: local ghost and percentile pool (TEST games skipped) |
| names.js, blocklist.txt | name sanitising, obscenity blocklist, AI comment cleaning |
| canned.js | kind fallback comments |

## Behaviour notes for the other seats
- Acks: every host:* event acks `{ ok, error? }`; host:bots acks `{ ok, count }`; player:submit acks `{ ok, error? }`
  (errors: ROUND_CLOSED, DUPLICATE, UNKNOWN_PLAYER, BAD_DRAWING). player:join ack also returns `name` (the cleaned one).
- Extra errors: NOT_HOST, NO_PLAYERS, NOT_IN_RESULTS, PLAYER_NOT_FOUND, SERVER_ERROR.
- `room:closed { reason }` goes to everyone when the host stays away 60 s, or the room is idle for 1 hour.
- A rejoin (same playerId) gets `lobby:update` then the room's current phase again. A resent mid-round
  `round:start` has `resumed: true` and countdownMs/durationMs shortened to the time left.
- Lobby players who disconnect are kept 20 s so a refresh keeps their slot.
- player:submit takes `strokes`; v1 phones sending only `points` count as one stroke.
- Drawings over 20 strokes / 2000 points are truncated, not rejected.
- `round:judging` is not resent on reconnect. `round:extras` is sent once per round, about 0.4 s after results in local mode.
- `game:end.stats` has `source: "snowflake" | "local"`.
- `SNOWFLAKE_MODULE` env points sf.js at another module (tests use a mock).
