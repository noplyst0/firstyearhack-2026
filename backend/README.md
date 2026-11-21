# backend

One Node server (Express + socket.io) for SkySketch. Contract: see `PLAN.md`.

```
cd backend
npm install
npm start          # http://localhost:3000  phone at /, host screen at /host
npm run smoke      # starts a test server on 3999 and checks the lobby + round flow
```

Demo over HTTPS (needed for phone motion on iOS): `cloudflared tunnel --url http://localhost:3000`

## Files
- `server.js`: static pages, socket.io events
- `rooms.js`: in-memory rooms with 4-letter codes (no I or O)
- `shapes.js`: loads `ai/shapes.json` if present, else a stub 64-point circle

## Status (foundation only)
Done: `host:create`, `player:join`, `lobby:update`, `host:start`, stub `round:start` (always the circle).
Not yet: `player:submit`, scoring, `round:results`, `game:end`, Snowflake. Waiting for the final plan.

## Extra events (not in the contract yet)
- `room:closed` server -> all: `{ reason }` when the host screen disconnects.
- Acks on `host:start`: `{ ok, error? }`. Failed `player:join` acks include `error`.
- `GET /health`: `{ ok, rooms }`.
