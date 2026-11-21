# SkySketch: Best Use of Snowflake pitch

## The 2-minute script

**1. The hook (15 s)**
"SkySketch is a party game where your phone becomes a laser pointer and you trace a shape in the air without seeing your line. The judge isn't a person or an AI model. It's Snowflake, doing geometry in SQL."

**2. Live round (30 s)**
*(Play one round. On the judging screen:)*
"Right now every drawing is in a Snowflake table, and one SQL query is scoring the whole room. That counter is the number of distance checks Snowflake is doing: about 278,000 per player. It comes back in about 2 seconds."

**3. How the scoring query works (40 s)**
"Each drawing is 64 points. Each shape is 256 points. The query joins every drawing point with every point of every shape in our library of 17 shapes. For each point it keeps the nearest distance, using MIN with GROUP BY, then averages them.
We measure both ways. Did you stay on the line, and did you cover the whole shape. That's called Chamfer distance.
Then a window function ranks the room, and QUALIFY with ROW_NUMBER picks the shape your drawing looks most like. That's where 'Snowflake thinks you drew a potato' comes from.
Scoring, ranking and guessing all happen in one query, for every player at once."

**4. Snowflake as memory (25 s)**
"Every drawing is kept. That history powers the rest of the game:
ghost players, which are real past drawings replayed and picked with PERCENT_RANK so you get good, average and bad ones;
percentiles, like 'better than 36% of today's circles';
and the stats at the end. Steadiest hands is a real tremor measurement: LAG compares each point with the one before, ATAN2 gives the turning angle and STDDEV measures how shaky it was.
The crowd drawing uses MIN_BY to blend everyone's line into one and scores it. Today we've stored [N] drawings from [M] games."

**5. Close (10 s)**
"Snowflake isn't just where we keep the data. It's the referee, the scorekeeper and the memory of the game."

---

## Technical cheat sheet

### The data model (schema SKYSKETCH.GAME)
| Table | One row per | Key columns |
|---|---|---|
| `GAMES` | game | game_id, room_code, is_test |
| `TARGETS` | shape | shape_id, name, label ("a potato"), difficulty, is_round |
| `TARGET_POINTS` | point of a shape | shape_id, idx (0 to 255), x, y |
| `ATTEMPTS` | drawing | attempt_id, game_id, round, player_id, player_name, shape_id, is_bot, is_practice, submitted_at, raw_strokes |
| `ATTEMPT_POINTS` | point of a drawing | attempt_id, idx (0 to 63), stroke, x, y |
| `SCORES` | scored drawing | accuracy, on_line, coverage, final_score, rank_in_round, points_awarded, guess_shape_id, scorer |
| `CONFIG` | setting | D_MAX = 0.35 (the distance that counts as 0%) |

Points are stored as rows, not blobs. That's what lets SQL do geometry on them with joins.

### What happens each round
1. The server cleans each drawing in Node: resample to 64 evenly spaced points, centre on (0,0), scale to a standard size. So position, size and drawing speed don't matter.
2. **Bulk insert** into `ATTEMPTS` and `ATTEMPT_POINTS` with bound parameters (one statement per table, not one per row).
3. **`score_round.sql`** runs. Its steps, in order:
   - `att`: this round's drawing points.
   - `pairs`: join every drawing point with every target point of every shape, distance = `SQRT(SQUARE(dx) + SQUARE(dy))`.
   - `a2t`: for each drawing point, `MIN` distance to each shape (stayed on the line).
   - `t2a`: for each shape point, `MIN` distance to the drawing (covered the shape).
   - `AVG` both, turn into % with `GREATEST(0, 100 * (1 - d / D_MAX))`.
   - Guess: `QUALIFY ROW_NUMBER() OVER (PARTITION BY attempt_id ORDER BY accuracy DESC) = 1`.
   - Rank: `ROW_NUMBER() OVER (PARTITION BY is_bot ORDER BY accuracy DESC, coverage DESC, submitted_at)`. Ghosts are ranked separately so they never win.
   - Points with `IFF` and `CASE`: 300, 200, 100, then 50 for everyone else.
   - Written into `SCORES` in the same statement.
4. Read the scores back and send them to every screen.

### The numbers
- **64 x 256 x 17 = 278,528** distance checks per drawing. A room of 10 is about 2.8 million.
- **1.8 to 2.5 s** per round on an **X-Small** warehouse (the smallest size).
- About 100 players fit inside the 4 second limit. 150 players took 4.5 s.
- Warehouse auto-suspends after 10 minutes so it stays warm during the demo and costs nothing when idle.
- Trial credit: $400, and we've used a tiny fraction of it.

### The other queries
| Query | What it does | SQL features |
|---|---|---|
| `percentiles.sql` | "Better than X% of today's stars" against every stored real drawing | `COUNT_IF`, joins, excludes test and practice games |
| `ghost_pool.sql` | Picks past drawings to replay as ghosts, spread across skill levels | `PERCENT_RANK`, `ARRAY_AGG ... WITHIN GROUP (ORDER BY idx)` |
| `stats.sql` | Best ever, steadiest hands, most improved, most mistaken for, average per shape | `LAG`, `ATAN2`, `STDDEV`, `QUALIFY ROW_NUMBER`, `PARTITION BY` |
| `room_view.sql` | Crowd drawing: blends everyone's line into one and scores it | `MIN_BY` (take the x, y of the closest point) |

How the stats work:
- **Steadiest hands:** for each drawing, `LAG` gets the previous point, `ATAN2` gives the direction between points, the change in direction is the turning angle, `STDDEV` of that is the tremor. Lowest wins.
- **Most improved:** `LAG(final_score) OVER (PARTITION BY game, player ORDER BY round)` gives the change from the last round.
- **Most mistaken for:** counts how often a shape's best guess was a different shape, e.g. "40% of stars looked like a squiggle".

### Reliability
- The same maths is written in JavaScript on the server. The server races Snowflake against a 4 second timer. If Snowflake is slow or down, local scoring is used and the game keeps going. The data still lands in Snowflake afterwards.
- **Parity test** (`ai/test/parity.js`): 10 drawings of mixed skill scored both ways. Largest difference **0.000**, same guesses, same ranks.
- Test games are tagged `TEST-` and practice rounds `is_practice`, so neither pollutes the stats.

### The honest bit about Cortex AI
- We planned to use `AI_COMPLETE` for the jokes and a vision model for guesses.
- Snowflake **blocks AI functions on trial accounts** (we got "not available for trial accounts" on every model).
- So we moved the smart work into SQL: the guess is geometry against a shape library, and the jokes are rules built from each player's stats.
- With a paid account the next step is clear: `AI_COMPLETE` for jokes, and `AI_COMPLETE` with an image to describe the winner's drawing, all inside Snowflake.

---

## Likely Snowflake judge questions

| Question | Answer |
|---|---|
| Why do this in Snowflake instead of JavaScript? | One query scores, ranks and guesses for the whole room at once, and every drawing is kept, so ghosts, percentiles, stats and the crowd drawing work across all games, not just this one. |
| Isn't a cross join slow? | It's 2.8 million pairs for 10 players and Snowflake does it in about 2 s on the smallest warehouse. It's exactly the kind of wide, parallel work a warehouse is built for. |
| How would it scale? | A bigger warehouse for big rooms, or pre-filter pairs with a coarse grid so far-away points are never compared. The local fallback already covers spikes. |
| How do you know Snowflake's score is right? | The parity test: Snowflake and our JavaScript version agree to 0.000 on the same drawings. |
| Why store points as rows? | So SQL can join and aggregate them. A JSON blob would need unpacking every time. We also keep the raw JSON for replays. |
| Did you use Cortex? | We tried. AI functions are blocked on trials, so we did the work in SQL. On a paid account we'd add `AI_COMPLETE` for jokes and image descriptions. |
| What's a window function? | A function that looks across a group of rows, like "rank these players by score" or "compare this point with the previous one", without collapsing them. We use `ROW_NUMBER`, `PERCENT_RANK` and `LAG`. |
| What's QUALIFY? | A Snowflake filter for window function results. We use it to keep only the best guess per drawing. |
| What's MIN_BY? | Returns a value from the row with the smallest of something else. We use it to take the x, y of the closest point when blending the crowd drawing. |
| What does it cost? | An X-Small warehouse, about 2 seconds per round. Pennies of trial credit. |
| How many drawings do you have? | Check the final screen live. Earlier today it was 114 drawings from 19 games. |
