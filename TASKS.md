# Task board (every seat reads this before starting, updates it when done)

Format: `- [ ] T# | seat | folder | task | status/notes`
Claim a task by putting your seat name on it, commit + push straight away so others see it.

## Seats and timeline
See PLAN.md. Freeze demo 15:30, draft 17:30, final 18:00.

## Batch 1 (start now, all in parallel, about 60 min each)
- [ ] T1 | codex | backend/ | Node + Express + socket.io server on port 3000: serves frontend/phone at `/` and frontend/host at `/host`; rooms with 4-letter codes; implements every event in the PLAN.md contract with an in-memory game loop (3 rounds, 10 s each, results after all submit or timeout); `scoreLocal.js` with the PLAN.md scoring maths; `.env.example`; README run steps | todo
- [ ] T2 | claude66 | frontend/phone/ | Phone page: join screen (code + name), "Enable motion" button (iOS permission), lobby, round screen showing the target shape + countdown, records DeviceOrientation as a pointer path (yaw->x, pitch->y, calibrate centre on round start, sample ~30/s, normalise 0..1), live trail on screen, sends `player:submit`, shows results + own score + comment. Mobile-first, big buttons | todo
- [ ] T3 | argon | frontend/host/ | Big-screen page: create room, show code + QR code to `/` (use a QR library from cdnjs), lobby list, round screen with big target shape + countdown, results screen that overlays every player's path on the target with scores, winner reveal animation, final leaderboard. Bold retro party-game look, readable from the back of a lecture theatre | todo
- [ ] T4 | asim | ai/ | Snowflake: SQL setup script (database, warehouse XS with auto-suspend 60 s, tables rooms/players/targets/attempts/scores), `shapes.json` (circle, triangle, star, 64 points each in 0..1), scoring SQL that implements PLAN.md scoring on stored points, AI_COMPLETE one-line comment per attempt, a stats query for the end screen. Plus `ai/snowflake.js` helper for the backend (snowflake-sdk) with `saveAttempt()` and `scoreRound()` | todo
- [ ] T5 | lead | pitch/ | Pitch outline + presenter split | todo

## Batch 2 (after first merge, about 14:00)
- [ ] T6 | codex | backend/ | Wire ai/snowflake.js into the game loop with local fallback | todo
- [ ] T7 | neon | all | End-to-end test with 3 phones over the Cloudflare tunnel, fix list in TASKS.md | todo

## Done
