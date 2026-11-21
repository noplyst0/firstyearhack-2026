# SkySketch: how it works (team cheat sheet)

## In one sentence
Everyone uses their phone as a laser pointer to trace a shape in the air without seeing their line, and Snowflake scores every drawing with maths, live, in about 2 seconds.

## The 4 parts
| Part | What it is | Where |
|---|---|---|
| Phone | A web page. No app, no account. Turns the phone into a pointer | `frontend/phone/` |
| Big screen | A web page on the projector: shape, reveal, podium, stats | `frontend/host/` |
| Server | One Node.js program on the laptop that runs rooms, rounds and timers | `backend/` |
| Snowflake | Cloud database that stores every drawing and scores them in SQL | `ai/` |

They talk over **WebSockets** (an always-open connection, so the server can push "round starts now" to every phone instantly). Phones only allow motion sensors on `https://`, so a **Cloudflare tunnel** gives the laptop a public https link.

## A game, step by step
1. **Join.** Big screen shows a 4-letter code and a QR code. Scan, pick a name (or tap the dice), tap JOIN. iPhones ask for motion permission on that tap.
2. **Practice round (circle).** You can see your line live on your phone. Scores 0 points. It is there so people learn how it works.
3. **Real rounds (square, then star).** You draw blind. Hold your thumb down to draw, lift it to stop. Tap I'M DONE when finished. The round ends when everyone is done, when time runs out, or when the host presses End round now.
4. **Judging.** The server sends all drawings to Snowflake. One SQL query scores and ranks the whole room. The big screen shows "Judged by Snowflake in 2.4 s".
5. **Reveal.** Drawings appear full screen one by one, worst to best, each with "Snowflake thinks you drew...". Winner last.
6. **Crowd drawing.** Everyone's drawings blended into one line, scored against the shape. Usually beats the average player.
7. **Podium.** 3rd, 2nd, drum roll, 1st. Then the leaderboard and Snowflake stats.

## How the phone becomes a pointer
- The phone's **gyroscope** and sensors give its orientation as 3 angles (alpha = turn left/right, beta = tilt forward/back, gamma = roll).
- From those we work out where the **back of the phone points** (like a laser beam).
- In the 3-2-1 countdown we save that direction as the **centre**. While drawing we measure how far you turned from it, up/down and left/right. That becomes x, y.
- **FOV 60** = sensitivity: turning 60 degrees crosses the whole drawing area.
- Smoothing removes hand shake. A spike filter throws away impossible jumps (a known sensor glitch when the phone is upright).
- **Why not track real arm movement?** Phones have no position sensor. Adding up accelerometer readings drifts off screen within 1 to 2 seconds. Rotation does not drift.
- You do **not** need to face the big screen. Only the change from the starting direction matters.

## How a drawing is scored (pure maths, same drawing = same score)
1. **Resample:** the drawing becomes 64 evenly spaced points (drawing speed stops mattering).
2. **Normalise:** move its middle to (0,0) and scale it to a standard size (position and size stop mattering).
3. **Measure both ways** (called Chamfer distance):
   - **Stayed on the line:** for each of your points, distance to the nearest point of the shape. Catches scribbles.
   - **Covered the shape:** for each of the shape's 256 points, distance to the nearest point of your drawing. Catches half-drawn shapes.
4. **Turn into %:** distance 0 = 100%, distance 0.35 or more (D_MAX) = 0%. Score = average of the two.
- Rough guide: careful trace 65 to 95%, random scribble about 27%, straight line under 20%.
- **Points:** 1st 300, 2nd 200, 3rd 100, everyone else who drew 50.
- **Guess:** your drawing is also scored against 17 shapes (including decoys like egg, potato, spiral). The best match is "Snowflake thinks you drew...".

## What Snowflake does
- **Tables:** `TARGET_POINTS` (shapes, 256 points each), `ATTEMPTS` + `ATTEMPT_POINTS` (every drawing), `SCORES`.
- **Scoring in SQL:** one query compares every drawing point with every shape point for all 17 shapes, finds nearest distances, averages them, picks the guess and ranks players with a **window function** (a SQL feature that compares rows with each other). About **278,000 distance checks per drawing**, done in about 2 seconds.
- **Percentiles:** "Better than 36% of today's circles", against every stored drawing.
- **Ghosts:** fake players that are real past drawings replayed from the database, picked with `PERCENT_RANK` so you get good, average and bad ones.
- **Final stats (all SQL):** best ever, steadiest hands (tremor measured from angle changes between points with `LAG`), most improved, "most mistaken for" (e.g. 40% of stars looked like a squiggle), average per shape.
- **Crowd drawing:** blends everyone's line into one in SQL and scores it.
- **Safety net:** the server has the same maths in JavaScript. If Snowflake takes over 4 s, it scores locally and the game carries on. We tested both give exactly the same scores (difference 0.000).
- **Honest note:** Snowflake's AI functions are blocked on trial accounts. So the jokes are rule-based (built from each player's stats) and all the heavy work is SQL.

## Likely judge questions
| Question | Answer |
|---|---|
| Is the score AI or opinion? | Neither. Geometry. Same drawing, same score every time. |
| Can you cheat by scribbling? | Scribbles fail "stayed on the line" and score about 27%. |
| Why a pointer, not arm tracking? | Accelerometer drift. Rotation is stable. Old motion games pointed too. |
| Why Snowflake, not just JavaScript? | It keeps every drawing, so ghosts, percentiles, stats and the crowd drawing work across games. And one SQL query scores the whole room at once. |
| Did you use Snowflake AI? | Planned to, but it is blocked on trial accounts. We did the work in SQL instead. |
| What if Snowflake goes down? | Local scoring takes over automatically. Same maths, same scores. |
| How many players? | Server tested with 150 players plus 50 ghosts. Snowflake scores about 100 within the time limit. Above that, local scoring. |
| What data do you store? | Drawings, scores and the nickname. No accounts, no personal data. |
| Serious use? | Measuring hand-eye coordination and fine motor control objectively: rehab after injury, steady-hand warm-ups for surgeons. "Steadiest hands" is a real tremor measure. |
| How is it Retro Remix? | 2000s motion-controller party games, rebuilt: the controller is the phone already in your pocket, any number of players, and a data platform is the referee. |
| How did 2 people build it in a day? | 6 AI agents in JetBrains Air, each in its own folder and branch, working from one shared plan file in the repo. We merged and tested between rounds. |
| What next? | Smoother pointing with full sensor fusion, team mode, and letting a judge draw a shape for the room to trace. |
