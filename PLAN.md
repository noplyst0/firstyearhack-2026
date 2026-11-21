# FirstYearHack 2026: team plan

**v3 (16:00): read plan/V3.md first. It wins over SHARED.md where they differ.**

Every AI reads this first, then `plan/SHARED.md` and its own seat file in `plan/`, then TASKS.md, then `git log --oneline -20`. Update this file in the same commit when the plan or contract changes. CLAUDE.md and AGENTS.md are copies of this file: change all three together.

## Plan v2 (21 Nov, 14:20)
Full spec: `plan/SHARED.md` (everyone), then your seat file (`plan/backend.md`, `plan/phone.md`, `plan/host.md`, `plan/ai.md`, `plan/spare.md`). After the 17:00 freeze: `plan/stretch.md`. Lead checklist: `pitch/LEAD.md`. MUST tasks: TASKS.md batch 3.

### What changed from v1 (patch anything you already built)
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

## Idea: SkySketch (working name)
A party game where your phone is the controller. The big screen shows a shape (round 1 easy: circle).
Everyone traces it in the air by moving their phone for 10 seconds. Snowflake scores every attempt
with real maths (no opinion), then the winner shows on the big screen and every phone. 3 rounds, points for everyone, live leaderboard.
Track: **Retro Remix** (motion-controller party games of the 2000s, rebuilt with the phone in your pocket and a data platform as the judge).
Serious angle for the pitch: hand-eye coordination and fine-motor training (rehab, surgical skills warm-ups), measured objectively.
Side prize: **best use of Snowflake** (scoring, leaderboard and analytics all run in Snowflake).

## Architecture (keep it this simple)
- ONE Node.js server (Express + socket.io) in `backend/`. It serves both web pages and the realtime events, so there is one URL and no CORS.
- Big screen page: `frontend/host/` (served at `/host`). Phone page: `frontend/phone/` (served at `/`). Plain HTML + JS + CSS, no build step.
- Phone motion: use DeviceOrientationEvent (gyroscope, alpha/beta) as a pointer, like aiming a remote at the screen. Map yaw -> x, pitch -> y.
  Do NOT integrate the accelerometer (too noisy). iOS needs `DeviceOrientationEvent.requestPermission()` on a button tap, and HTTPS.
- Snowflake (`ai/`): tables for rooms, players, targets, attempts (points), scores. Scoring is a SQL query. Backend talks to Snowflake with the `snowflake-sdk` npm package.
- Demo hosting: run on the laptop, expose over HTTPS with a Cloudflare tunnel (`cloudflared tunnel --url http://localhost:3000`). Backup: Render web service.
- Fallback: if Snowflake is unreachable, backend scores locally with the same maths (`backend/scoreLocal.js`) so the demo never dies.

## Scoring v2 (objective, runs in Snowflake; reference code in plan/SHARED.md §5)
1. The phone sends strokes in 0..1 canvas units, recorded only while the thumb is down. The backend resamples them to 64 points spread over all strokes by length.
2. Attempt and target are both normalised: centred, then scaled to RMS radius 1, so position and size don't matter.
3. d1 = average distance from each attempt point to its nearest target point (how far you strayed). d2 = the same in reverse (how much of the shape you missed). accuracy = 100 × max(0, 1 - ((d1 + d2) / 2) / D_MAX) with D_MAX 0.35. onLine and coverage use d1 and d2 on their own. Score = accuracy.
4. Guess: the same maths against every library shape (round shapes plus decoys). The best match becomes "Snowflake thinks you drew ...".
5. Round points: 1st 300, 2nd 200, 3rd 100, every other valid real drawing 50, missing or invalid 0. Ghosts get no rank and 0 points.
Extras: `AI_COMPLETE` writes a funny line for the top 3 and last place. Every stored drawing feeds the ghosts, percentiles and end-screen stats.

## Contract v2 (socket.io, transports ['websocket'] on both sides; JSON shapes are fixed, change only via this file)
Client to server:
| Event | Payload | Ack |
|---|---|---|
| `host:create` | `{ code?, test? }` | `{ code, state }` |
| `host:start` | `{ code, rounds: 3 or 5 }` | |
| `host:next` | `{ code }` (results to next round or final) | |
| `host:again` | `{ code }` (back to lobby, same players, totals reset) | |
| `host:kick` | `{ code, playerId }` | |
| `host:bots` | `{ code, count }` (lobby only) | |
| `player:join` | `{ code, name, playerId? }` | `{ ok, playerId, error? }` |
| `player:submit` | `{ code, playerId, round, strokes: [[[x,y]...]...], points: [[x,y]...] }` | |

Errors: ROOM_NOT_FOUND, ROOM_STARTED, ROOM_FULL, NAME_TAKEN, NAME_BLOCKED, NAME_INVALID.
`points` = strokes.flat(), kept so v1 code still works.

Server to clients:
| Event | Payload |
|---|---|
| `lobby:update` | `{ players: [{ id, name, isBot }] }` |
| `player:kicked` | `{}` (only to the kicked phone) |
| `round:start` | `{ round, totalRounds, shapeId, shapeName, difficulty, targetStrokes, targetPoints, durationMs, countdownMs, memory, fov, smoothing }` |
| `round:progress` | `{ round, submitted, total }` |
| `round:judging` | `{ round, drawings, distanceChecks }` |
| `round:results` | see below |
| `round:extras` | `{ round, comments?: { playerId: text }, percentiles?: { playerId: { beatPct, pool } }, heat?, crowd?, verdict?, vision? }` (can arrive more than once: merge) |
| `game:end` | `{ leaderboard: [{ playerId, name, total }], stats }` |

`round:results` = `{ round, shapeId, shapeName, targetNorm: [[x,y] x64], scorer: "snowflake" | "local", judgeMs, winner: { playerId, name, score } | null, results: [{ playerId, name, isBot, valid, score, accuracy, onLine, coverage, rank, roundPoints, totalPoints, guess: { shapeId, label, score } | null, comment, pathStrokes }] }`
- Order: ranked real players, then invalid real players, then ghosts by score.
- comment is null for featured players (top 3 and last place). Their AI comment arrives in round:extras within 3.5 s, or a canned line if the AI is slow.
- targetStrokes and targetPoints use 0..1 canvas units (y down). targetNorm and pathStrokes are normalised (centre 0,0, RMS radius 1).

Stretch events (branches after 17:00 only): `host:customShape { code, name, strokes }` ack `{ ok, shapeId, guess }` · `host:snapshot { code, round, playerId, png }` · `player:shake { code, playerId }` · `room:shake { count, total, open }`.

Shapes (`ai/shapes.json`): plan/SHARED.md §6 (5 round shapes and 10 decoys; strokes in 0..1 plus 64 normalised points each).

## Who owns what (only edit your own folder)
| Seat | Account | Folder | Branch | Spec |
|---|---|---|---|---|
| Claude Agent (Air) | Claude ...66 | backend/ | claude-backend | plan/backend.md |
| Argon (Air) | Google | frontend/phone/ | argon-phone | plan/phone.md |
| Codex (Air) | ChatGPT ...66 | frontend/host/ (visual, low risk) | codex-host | plan/host.md |
| Asim's Claude (Air) | Asim | ai/ (Snowflake SQL, shapes, scoring) | asim-ai | plan/ai.md |
| Neon (Air) | Google | tools/, README.md (spare: polish, bugs) | neon-misc | plan/spare.md |
| Lead (Claude chat) | Claude ...48 | PLAN.md, TASKS.md, plan/, pitch/, merges | main | pitch/LEAD.md |

## Rules
- Work on your own branch, push often. Only Faizan merges into main. Pull main after every merge.
- Never edit another seat's folder. Need a change there? Write it in TASKS.md.
- Secrets (Snowflake login) go in `backend/.env`, never committed. `.env.example` lists the variable names.
- Freeze a working demo by 17:00. Draft submission 17:30, final 18:00.
- After the freeze, stretch work goes on `<your branch>-stretch` (plan/stretch.md).

## Presenters
TBD

## Demo link
TBD

## Reference docs
- `docs/snowflake.md`: Snowflake features (side prize)
- `plan/`: the v2 spec, one file per seat
