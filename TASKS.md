# Task board (every seat reads this before starting, updates it when done)

Format: `- [ ] T# | seat | folder | task | status/notes`
Claim a task by putting your seat name on it, commit + push straight away so others see it.

## Seats and timeline
See PLAN.md. Freeze demo 15:30, draft 17:30, final 18:00.

## Batch 1 (start now, all in parallel, about 60 min each)
- [ ] T1 | claude66 | backend/ | Node + Express + socket.io server on port 3000: serves frontend/phone at `/` and frontend/host at `/host`; rooms with 4-letter codes; implements every event in the PLAN.md contract with an in-memory game loop (3 rounds, 10 s each, results after all submit or timeout); `scoreLocal.js` with the PLAN.md scoring maths; `.env.example`; README run steps | todo
- [ ] T2 | argon | frontend/phone/ | Phone page: join screen (code + name), "Enable motion" button (iOS permission), lobby, round screen showing the target shape + countdown, records DeviceOrientation as a pointer path (yaw->x, pitch->y, calibrate centre on round start, sample ~30/s, normalise 0..1), live trail on screen, sends `player:submit`, shows results + own score + comment. Mobile-first, big buttons | todo
- [ ] T3 | codex | frontend/host/ | Big-screen page: create room, show code + QR code to `/` (use a QR library from cdnjs), lobby list, round screen with big target shape + countdown, results screen that overlays every player's path on the target with scores, winner reveal animation, final leaderboard. Bold retro party-game look, readable from the back of a lecture theatre | todo
- [ ] T4 | asim | ai/ | Snowflake: SQL setup script (database, warehouse XS with auto-suspend 60 s, tables rooms/players/targets/attempts/scores), `shapes.json` (circle, triangle, star, 64 points each in 0..1), scoring SQL that implements PLAN.md scoring on stored points, AI_COMPLETE one-line comment per attempt, a stats query for the end screen. Plus `ai/snowflake.js` helper for the backend (snowflake-sdk) with `saveAttempt()` and `scoreRound()` | todo
- [ ] T5 | lead | pitch/ | Pitch outline + presenter split | todo

## Batch 2 (after first merge, about 14:00)
- [ ] T6 | claude66 | backend/ | Wire ai/snowflake.js into the game loop with local fallback | todo
- [ ] T7 | neon | all | End-to-end test with 3 phones over the Cloudflare tunnel, fix list in TASKS.md | todo

## Batch 3: plan v2 MUST tasks (21 Nov 14:20, before the 15:30 freeze)
Read PLAN.md, then plan/SHARED.md and your seat file. Where these differ from T1 to T7, these win. Running late? Use the cut order in plan/SHARED.md §7.
- [ ] T8 | claude66 | backend/ | Server v2: socket.io websocket only, static routes, /health, no-vowel room codes, TEST games, every SHARED §4 event incl. host:next, host:again, host:kick, host:bots, round:progress, early round end (plan/backend.md §1-2) | todo
- [ ] T9 | claude66 | backend/ | scoreLocal.js v2 (SHARED §5: strokes, onLine, coverage, guess, D_MAX 0.35) + scoreRoundLocal + tests 1 to 8 (plan/backend.md §9) | todo
- [ ] T10 | claude66 | backend/ | Judging pipeline: round:judging, Snowflake race 4 s with local fallback, round:results, round:extras with comments and percentiles by 3.5 s, data/attempts.jsonl (plan/backend.md §3) | todo
- [ ] T11 | claude66 | backend/ | Ghosts: host:bots, pool from Snowflake then attempts.jsonl then fakeAttempt; no rank, 0 points (plan/backend.md §4) | todo
- [ ] T12 | claude66 | backend/ | Names and safety: sanitise, obscenity blocklist, kick, reconnect, host reclaim, host:again; comments with canned fallback and blocklist filter; game end stats; keep-warm ping; SNOWFLAKE_ENABLED switch (plan/backend.md §5-8) | todo
- [ ] T13 | argon | frontend/phone/ | Join: code from URL, name + Generate, JOIN calls askMotion first, error messages, sessionStorage rejoin (plan/phone.md screen 1) | todo
- [ ] T14 | argon | frontend/phone/ | Lobby motion test dot + re-centre, no-motion and denied messages; get-ready screen with memory round and calibration (plan/phone.md screens 2-3) | todo
- [ ] T15 | argon | frontend/phone/ | Hold to draw: strokes only while the thumb is down, 33 ms sampling, smoothing, no clamp, progress ring, wake lock, submit at timer end; ?debug=1 and ?mouse=1 (plan/phone.md screen 4 + Motion) | todo
- [ ] T16 | argon | frontend/phone/ | Judging, results (bars, guess, percentile, comment from round:extras), final, kicked, reconnect banner (plan/phone.md screens 5-9) | todo
- [ ] T17 | codex | frontend/host/ | Lobby: code, QR, chips with kick, rounds 3 or 5, Add 20 ghosts, START unlocks audio, Snowflake pill, ?test=1, reclaim after refresh (plan/host.md screen 1) | todo
- [ ] T18 | codex | frontend/host/ | Round screen (memory round poof, timer bar, x / N drawings in) + judging screen with the distance checks counter (plan/host.md screens 2-3) | todo
- [ ] T19 | codex | frontend/host/ | Results reveal worst to best in 12 s max, winner moment, ranked list with bars, guess and comments, ghost footer (plan/host.md screen 4) | todo
- [ ] T20 | codex | frontend/host/ | Final screen with podium, leaderboard, stats panel, Play again; WebAudio sounds + mute (plan/host.md screens 5-7) | todo
- [ ] T21 | asim | ai/ | Snowflake login from Node (key-pair if MFA blocks) + AI_COMPLETE model check, cross-region if needed (plan/ai.md §1) | todo
- [ ] T22 | asim | ai/ | setup.sql v2 + make_shapes.js + shapes.json (15 shapes) + load_shapes.js (plan/ai.md §2-3) | todo
- [ ] T23 | asim | ai/ | snowflake.js API + SQL: score_round with guesses, read back, percentiles, ghost pool, comments, stats (plan/ai.md §4-5) | todo
- [ ] T24 | asim | ai/ | test/parity.js: Snowflake vs scoreRoundLocal within 0.1 on 10 paths (plan/ai.md §6) | todo
- [ ] T25 | neon | tools/ | tools/loadtest.js: 150 players through the public URL, timings and errors (plan/spare.md 1) | todo
- [ ] T26 | neon | README.md | README: run steps, Snowflake env names, setup, credits (plan/spare.md 2) | todo
- [ ] T27 | neon | all | Device pass at 14:40 and 15:15 on iPhone + Android, bugs logged here with seat tags (plan/spare.md 3) | todo
- [ ] T28 | neon | all | 16:00 backup video of a full round, copied to a USB stick and a phone (plan/spare.md 4) | todo

## Done
