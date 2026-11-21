# FirstYearHack 2026: team plan

Every AI reads this first, then TASKS.md, then `git log --oneline -20`. Update this file in the same commit when the plan or contract changes.

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

## Scoring (objective, runs in Snowflake)
1. Phone sends its path as points normalised to 0..1. Backend resamples to 64 points evenly spaced along the path.
2. Both target and attempt are normalised: centred on their centroid, scaled to unit size (so position and size don't matter).
3. Accuracy = 100 * (1 - average distance from each attempt point to its nearest target point, capped), plus the same in reverse (covers the whole shape).
4. Smoothness = 100 - jitter (average change in direction between consecutive points). Final = 0.8 * accuracy + 0.2 * smoothness.
5. Round points: 1st 300, 2nd 200, 3rd 100, everyone else 50 (everyone gets points).
Extras: `AI_COMPLETE` writes one funny line per player ("your circle has the confidence of a potato"); end screen shows Snowflake stats across all games.

## Contract (socket.io events; JSON shapes are fixed, change only via this file)
| Event | From -> To | Payload |
|---|---|---|
| `host:create` | host -> server | `{}` -> ack `{ code: "ABCD" }` |
| `player:join` | phone -> server | `{ code, name }` -> ack `{ ok, playerId }` |
| `lobby:update` | server -> all in room | `{ players: [{ id, name }] }` |
| `host:start` | host -> server | `{ code, rounds: 3 }` |
| `round:start` | server -> all | `{ round, shapeId, targetPoints: [[x,y]...], durationMs: 10000 }` |
| `player:submit` | phone -> server | `{ code, playerId, round, points: [[x,y]...] }` (x,y in 0..1) |
| `round:results` | server -> all | `{ round, results: [{ playerId, name, score, accuracy, smoothness, points, comment }], winner: { playerId, name } }` |
| `game:end` | server -> all | `{ leaderboard: [{ playerId, name, total }], stats: { ... } }` |
Shapes (`ai/shapes.json`): circle (round 1), triangle, star; each 64 points in 0..1.

## Who owns what (only edit your own folder)
| Seat | Account | Folder | Branch |
|---|---|---|---|
| Claude Agent (Air) | Claude ...66 | backend/ | claude-backend |
| Argon (Air) | Google | frontend/phone/ | argon-phone |
| Codex (Air) | ChatGPT ...66 | frontend/host/ (visual, low risk) | codex-host |
| Asim's Claude (Air) | Asim | ai/ (Snowflake SQL, shapes, scoring) | asim-ai |
| Neon (Air) | Google | spare: polish, bugs, README | neon-misc |
| Lead (Claude chat) | Claude ...48 | PLAN.md, TASKS.md, pitch/, merges | main |

## Rules
- Work on your own branch, push often. Only Faizan merges into main. Pull main after every merge.
- Never edit another seat's folder. Need a change there? Write it in TASKS.md.
- Secrets (Snowflake login) go in `backend/.env`, never committed. `.env.example` lists the variable names.
- Freeze a working demo by 15:30. Draft submission 17:30, final 18:00.

## Presenters
TBD

## Demo link
TBD

## Reference docs
- `docs/snowflake.md`: Snowflake features (side prize)
