# LEAD CHECKLIST (Faizan)

## Now
- Every Air session reads PLAN.md (it loads as CLAUDE.md or AGENTS.md), then plan/SHARED.md and its seat file:
  - Claude Agent: plan/backend.md, branch claude-backend
  - Argon: plan/phone.md, branch argon-phone
  - Codex: plan/host.md, branch codex-host
  - Asim's Claude: plan/ai.md, branch asim-ai
  - Neon: plan/spare.md, branch neon-misc

  Seats that already started should read SHARED §0 first and patch what they built.
- Keep PLAN.md, CLAUDE.md and AGENTS.md identical: change all three in the same commit.
- Ask the organisers:
  - Is the pitch on stage to the whole room or to judges at a table, and how long is it?
  - What are the judging criteria?
  - How is the Snowflake prize judged: at a separate table or from the submission?
  - Can we re-upload the submission?
- Decide presenters now (PLAN.md still says TBD).
- Snowflake: Node login, setup.sql, model check (plan/ai.md §1).
- Hand-check each seat's output on your own phone between prompts. Keep one session per folder or worktree. Check in hourly: is the deck still built around the demo?

## 14:30 to 15:00
- Create a Render web service from main: start command `node backend/server.js`, env vars from .env.
- Render's free tier sleeps after 15 min with no traffic and takes about a minute to wake, so open /host 5 minutes before any demo.
- Quick tunnels cap at 200 in-flight requests. That's fine for a table demo; use Render for a whole room.

## 15:30
- Tag demo-v1 and demo from the tag. Stretch features only on `-stretch` branches, merged only if safe.

## 15:30 to 17:00: soft launch
- Take a laptop round other teams and play one round with each. Count players and drawings for the pitch.
- This also fills Snowflake with real ghosts and percentiles, and gives you real drawings to tune D_MAX.

## Pitch (3 min, demo first)
1. Live round straight away: "Phones out, scan, trace the circle. You can't see your line." The room is pre-loaded with 20 ghosts.
2. The reveal and Snowflake's verdict.
3. Problem with a number: "Motion party games needed a console and a controller each, and maxed out at 4 players. Today {N} people played at once on the phones in their pockets." Check the 4-remote figure on a primary page first.
4. Under the hood:
   - The gyroscope is read in the browser, and the phone sends strokes to the server.
   - Snowflake scores every drawing with a symmetric Chamfer distance in SQL across {1.8M} point pairs and ranks with window functions.
   - It also guesses the shape against a library, and Cortex AI_COMPLETE writes the jokes.
   - Every drawing is stored, which is where the ghosts, percentiles and stats come from.
   - The same maths runs locally if Snowflake is slow.
5. Evaluation: tuned on real drawings (careful traces {x}, scribbles {y}, standing still 0). Snowflake and the local scorer agree within 0.1.
6. Soft launch: launched at this hackathon this afternoon ({N} players, {M} drawings). Next: KCL Tech socials, society icebreakers, lecture theatres.
7. Onboarding: scan, tap, play. No app, no account.
8. Human in the loop: the maths sets the score, the AI only writes the joke, names are filtered and the host can kick.
9. Close on the winning path over the target. Don't end on "thank you".

Retro Remix slide: then (console, remotes, sensor bar) next to now (a QR code). If the Snowflake prize is judged separately, prepare a 60 s cut with the scoring SQL on screen.

## Q&A
- Why not the accelerometer? Drift.
- Does standing at the back hurt your score? No, scoring ignores position and size.
- What does Snowflake add? It stores every drawing, scores and ranks in SQL, and runs the AI in the same place.
- What about cheating? Scribbles score low and no movement is invalid.
- What's next? Using the phone camera to spot markers on the big screen, the way the old sensor bar worked.

## Submit
- Draft by 17:30, final by 18:00 on https://mlh.link/first-year-hack. Tick the Snowflake prize.
- Put the demo link in PLAN.md and the submission.
- Check for secrets: git log -p | grep -i password.
- Keep the Air sessions.
