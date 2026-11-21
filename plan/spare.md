# SEAT: SPARE · Neon · folder tools/ and README.md · branch neon-misc
Read plan/SHARED.md first.

1. tools/loadtest.js (with its own package.json and socket.io-client): `node tools/loadtest.js --url <public URL> --players 150 --rounds 3`.
   - A fake host sends host:create { test: true }.
   - N players connect with transports ['websocket'], named "Load 1".."Load N".
   - Then host:start. Each player submits the target strokes plus noise 2 to 8 s after GO. The host sends host:next after each result.
   - Print: how many joins worked, any 429s or disconnects, time from round end to round:results, time to round:extras.
   - Run it on localhost, then through the tunnel, then on Render.
2. README.md:
   - What it is, in 2 lines.
   - Run steps: `cd backend && npm install && node server.js`, then `cloudflared tunnel --url http://localhost:3000`.
   - Snowflake variable names (see backend/.env.example), plus ai/setup.sql and `node ai/load_shapes.js`.
   - Credits for every seat.
3. Device pass at 14:40 and again at 15:15, on iPhone Safari and Android Chrome. Check:
   - the motion prompt inside JOIN, and what happens when motion is denied
   - portrait lock and wake lock
   - low power mode
   - reconnect after a refresh
   - the kicked screen

   Log bugs in TASKS.md, tagged by seat.
4. 16:00: record a 60 s backup video of a full round (phones + big screen). Copy it to a USB stick and a phone.
