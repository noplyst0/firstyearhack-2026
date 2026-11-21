# SEAT: AI / SNOWFLAKE · Asim's Claude · folder ai/ · branch asim-ai
Read plan/SHARED.md first. None of this SQL has been run yet: run each query once on sample data and fix the syntax before wiring it in.

## Files
setup.sql, make_shapes.js, shapes.json, load_shapes.js, snowflake.js, sql/score_round.sql, sql/percentiles.sql, sql/ghost_pool.sql, sql/stats.sql, sql/room_view.sql (stretch), test/parity.js.

## 1. First 10 minutes
- Log in from Node with snowflake-sdk. If MFA blocks password login, switch to key-pair auth (authenticator 'SNOWFLAKE_JWT' with the private key path).
- Check the model works: SELECT AI_COMPLETE('<SNOWFLAKE_MODEL>', 'Say hi in 3 words');
- If the model isn't available in your region, ACCOUNTADMIN runs: ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION'; (the docs don't say whether trial accounts allow this).

## 2. setup.sql (CREATE OR REPLACE wipes the v1 tables, which is fine because there's no real data yet)
```sql
CREATE DATABASE IF NOT EXISTS SKYSKETCH;
CREATE SCHEMA IF NOT EXISTS SKYSKETCH.GAME;
CREATE WAREHOUSE IF NOT EXISTS SKY_WH WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 600 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = FALSE;
ALTER WAREHOUSE SKY_WH SET AUTO_SUSPEND = 600;   -- 10 minutes, so there's no cold start mid-demo
USE WAREHOUSE SKY_WH; USE SCHEMA SKYSKETCH.GAME;

CREATE OR REPLACE TABLE GAMES (game_id STRING, room_code STRING, is_test BOOLEAN, created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());
CREATE OR REPLACE TABLE TARGETS (shape_id NUMBER, name STRING, label STRING, difficulty NUMBER, is_round BOOLEAN, is_custom BOOLEAN DEFAULT FALSE);
CREATE OR REPLACE TABLE TARGET_POINTS (shape_id NUMBER, idx NUMBER, x FLOAT, y FLOAT);
CREATE OR REPLACE TABLE ATTEMPTS (attempt_id STRING, game_id STRING, round NUMBER, player_id STRING, shape_id NUMBER,
  is_bot BOOLEAN, n_raw_points NUMBER, n_strokes NUMBER, duration_ms NUMBER, submitted_at TIMESTAMP_NTZ,
  raw_strokes STRING);   -- JSON text: Snowflake rejects PARSE_JSON inside VALUES
CREATE OR REPLACE TABLE ATTEMPT_POINTS (attempt_id STRING, idx NUMBER, stroke NUMBER, x FLOAT, y FLOAT);
CREATE OR REPLACE TABLE SCORES (attempt_id STRING, accuracy FLOAT, on_line FLOAT, coverage FLOAT, final_score FLOAT,
  rank_in_round NUMBER, points_awarded NUMBER, guess_shape_id NUMBER, guess_score FLOAT, scorer STRING,
  scored_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());
CREATE OR REPLACE TABLE CONFIG (k STRING, v FLOAT);
INSERT INTO CONFIG VALUES ('D_MAX', 0.35);
CREATE STAGE IF NOT EXISTS SKY_IMAGES ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE') DIRECTORY = (ENABLE = TRUE);   -- stretch: vision
```
Tuning D_MAX: UPDATE CONFIG SET v = <new> WHERE k = 'D_MAX'; and ask Claude Agent (backend seat) in TASKS.md to change backend/constants.js to the same value.

## 3. make_shapes.js -> shapes.json
Uses resampleStrokes + normaliseStrokes from ../backend/scoreLocal.js. Parametric shapes use 400 raw points, and closed shapes end on their first point. Output [{ id, name, label, difficulty, round, strokes, norm }] sorted by id. Difficulty: circle 1, triangle 2, square 2, star 3, heart 3, decoys 0. round = true for ids 1 to 5.

| id | name | label | definition (0..1 canvas, y down) |
|---|---|---|---|
| 1 | circle | a circle | centre (0.5, 0.5), r 0.4 |
| 2 | triangle | a triangle | (0.5,0.12) (0.88,0.78) (0.12,0.78), closed |
| 3 | square | a square | (0.15,0.15) (0.85,0.15) (0.85,0.85) (0.15,0.85), closed |
| 4 | star | a star | 10 vertices alternating outer 0.4 / inner 0.16, from -90°, step 36°, closed |
| 5 | heart | a heart | x = 16 sin³t, y = -(13 cos t - 5 cos 2t - 2 cos 3t - cos 4t); fit the longer side to 0.8, centre at (0.5, 0.5) |
| 10 | egg | an egg | ellipse rx 0.3, ry 0.4 |
| 11 | pancake | a pancake | ellipse rx 0.42, ry 0.14 |
| 12 | potato | a potato | r(θ) = 0.33 (1 + 0.12 sin 3θ + 0.08 cos 5θ) |
| 13 | zigzag | a zigzag | (0.1,0.7) (0.3,0.3) (0.5,0.7) (0.7,0.3) (0.9,0.7), open |
| 14 | squiggle | a squiggle | x = 0.1 + 0.8t, y = 0.5 + 0.15 sin 6πt, t 0..1, open |
| 15 | figure of eight | a figure of eight | x = 0.5 + 0.25 sin 2t, y = 0.5 + 0.4 sin t, t 0..2π |
| 16 | spiral | a spiral | r = 0.04 + 0.36 t / 6π at angle t - π/2, t 0..6π, open |
| 17 | straight line | a straight line | (0.15,0.5) to (0.85,0.5) |
| 18 | house | a house | (0.2,0.85) (0.2,0.5) (0.5,0.15) (0.8,0.5) (0.8,0.85), closed |
| 19 | lightning bolt | a lightning bolt | (0.55,0.08) (0.25,0.55) (0.47,0.55) (0.4,0.92) (0.75,0.4) (0.52,0.4), closed |

load_shapes.js: truncate and reload TARGETS + TARGET_POINTS from shapes.json (the norm points, idx 0..63).

## 4. snowflake.js API (every function rejects on error; the backend owns the timeouts)
```js
init()                                    // connect using backend/.env, then ping()
ping()                                    // SELECT SUM(x) FROM TARGET_POINTS (keeps the warehouse awake)
saveGame({ gameId, code, isTest })
saveTarget(shape)                         // stretch: judge's shape into TARGETS + TARGET_POINTS
saveAndScoreRound({ gameId, round, shapeId, attempts })
  // attempts: [{ attemptId, playerId, isBot, valid, nRaw, nStrokes, durationMs, submittedAt, rawStrokes, pathStrokes }]
  // 1 bulk insert into ATTEMPTS (all), 1 into ATTEMPT_POINTS (valid only), score_round.sql, read back
  // returns [{ attemptId, accuracy, onLine, coverage, score, rank, roundPoints, guess: { shapeId, label, score } }]
comments(items)                           // [{ attemptId, prompt }] -> { attemptId: text }, in one statement
percentiles({ shapeId, gameId, round })   // -> { attemptId: { beatPct, pool } }
ghostPool({ shapeId, count })             // -> [{ attemptId, pathStrokes }]
gameStats()                               // -> { totalAttempts, totalGames, bestEver, hardestShape, commonWrongGuess, avgByShape: [{ shape, avg, n }] }
roomView({ gameId, round })               // stretch -> { heat: [64], crowd: [[x,y] x64] }
roomVerdict({ instruction, notes })       // stretch -> text
visionGuess({ pngPath })                  // stretch -> text
```
Bulk insert: execute({ sqlText: 'INSERT INTO ATTEMPT_POINTS (attempt_id, idx, stroke, x, y) VALUES (?, ?, ?, ?, ?)', binds: rows }), where rows is an array of arrays. idx runs 0..63 over the flat path and stroke is the stroke index.

## 5. SQL
score_round.sql (binds: gameId, round). Scores every drawing against every shape, so you get the guess in the same pass:
```sql
INSERT INTO SCORES (attempt_id, accuracy, on_line, coverage, final_score, rank_in_round,
                    points_awarded, guess_shape_id, guess_score, scorer)
WITH att AS (
  SELECT a.attempt_id, a.shape_id, a.is_bot, a.submitted_at, p.idx, p.x, p.y
  FROM ATTEMPTS a JOIN ATTEMPT_POINTS p ON p.attempt_id = a.attempt_id
  WHERE a.game_id = ? AND a.round = ?),
pairs AS (
  SELECT att.attempt_id, t.shape_id AS cand, att.idx AS a_idx, t.idx AS t_idx,
         SQRT(SQUARE(att.x - t.x) + SQUARE(att.y - t.y)) AS d
  FROM att JOIN TARGET_POINTS t ON t.shape_id < 1000 OR t.shape_id = att.shape_id),
a2t AS (SELECT attempt_id, cand, a_idx, MIN(d) AS d FROM pairs GROUP BY 1, 2, 3),
t2a AS (SELECT attempt_id, cand, t_idx, MIN(d) AS d FROM pairs GROUP BY 1, 2, 3),
dist AS (
  SELECT x1.attempt_id, x1.cand, x1.d1, x2.d2
  FROM (SELECT attempt_id, cand, AVG(d) AS d1 FROM a2t GROUP BY 1, 2) x1
  JOIN (SELECT attempt_id, cand, AVG(d) AS d2 FROM t2a GROUP BY 1, 2) x2
    ON x1.attempt_id = x2.attempt_id AND x1.cand = x2.cand),
acc AS (
  SELECT dist.attempt_id, dist.cand,
         GREATEST(0, 100 * (1 - ((dist.d1 + dist.d2) / 2) / c.v)) AS accuracy,
         GREATEST(0, 100 * (1 - dist.d1 / c.v)) AS on_line,
         GREATEST(0, 100 * (1 - dist.d2 / c.v)) AS coverage
  FROM dist JOIN CONFIG c ON c.k = 'D_MAX'),
guess AS (
  SELECT attempt_id, cand AS guess_shape_id, accuracy AS guess_score FROM acc
  QUALIFY ROW_NUMBER() OVER (PARTITION BY attempt_id ORDER BY accuracy DESC, cand ASC) = 1),
mine AS (
  SELECT a.attempt_id, a.is_bot, a.submitted_at, acc.accuracy, acc.on_line, acc.coverage
  FROM (SELECT DISTINCT attempt_id, shape_id, is_bot, submitted_at FROM att) a
  JOIN acc ON acc.attempt_id = a.attempt_id AND acc.cand = a.shape_id),
ranked AS (
  SELECT mine.*, ROW_NUMBER() OVER (PARTITION BY is_bot
           ORDER BY accuracy DESC, coverage DESC, submitted_at ASC) AS rn
  FROM mine)
SELECT r.attempt_id, r.accuracy, r.on_line, r.coverage, ROUND(r.accuracy, 1),
       IFF(r.is_bot, NULL, r.rn),
       IFF(r.is_bot, 0, CASE r.rn WHEN 1 THEN 300 WHEN 2 THEN 200 WHEN 3 THEN 100 ELSE 50 END),
       g.guess_shape_id, g.guess_score, 'snowflake'
FROM ranked r JOIN guess g ON g.attempt_id = r.attempt_id;
```
If Snowflake rejects WITH inside INSERT, wrap it as INSERT INTO SCORES (...) SELECT * FROM (WITH ... SELECT ...).

Read back (binds: gameId, round):
```sql
SELECT s.attempt_id, s.accuracy, s.on_line, s.coverage, s.final_score, s.rank_in_round, s.points_awarded,
       s.guess_shape_id, t.label AS guess_label, s.guess_score
FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id JOIN TARGETS t ON t.shape_id = s.guess_shape_id
WHERE a.game_id = ? AND a.round = ? AND s.scorer = 'snowflake';
```

percentiles.sql (binds: shapeId, gameId, round). The backend hides it when pool_size < 20:
```sql
WITH pool AS (
  SELECT s.attempt_id, s.final_score FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id
  WHERE a.shape_id = ? AND NOT a.is_bot AND a.game_id NOT LIKE 'TEST%'),
me AS (
  SELECT s.attempt_id, s.final_score FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id
  WHERE a.game_id = ? AND a.round = ? AND NOT a.is_bot)
SELECT me.attempt_id,
       ROUND(100 * COUNT_IF(pool.final_score < me.final_score) / COUNT(*)) AS beat_pct,
       COUNT(*) AS pool_size
FROM me JOIN pool ON pool.attempt_id <> me.attempt_id
GROUP BY me.attempt_id;
```
COUNT_IF(condition) counts the rows where the condition is true. Example: scores 50, 60, 80 with score < 72 gives 2.

ghost_pool.sql (bind: shapeId). Write the LIMIT in as a checked integer, because LIMIT may not take a bind:
```sql
WITH pick AS (
  SELECT attempt_id FROM ATTEMPTS
  WHERE shape_id = ? AND NOT is_bot AND game_id NOT LIKE 'TEST%'
  ORDER BY RANDOM() LIMIT 20)
SELECT p.attempt_id, ARRAY_AGG(ARRAY_CONSTRUCT(p.stroke, p.x, p.y)) WITHIN GROUP (ORDER BY p.idx) AS pts
FROM ATTEMPT_POINTS p JOIN pick ON pick.attempt_id = p.attempt_id
GROUP BY p.attempt_id;
```

comments: one statement for up to 4 players. Check that SNOWFLAKE_MODEL matches /^[a-z0-9.\-]+$/, then write it into the SQL text (binds: id1, prompt1, id2, prompt2, ...):
```sql
SELECT column1 AS attempt_id, AI_COMPLETE('<MODEL>', column2) AS comment
FROM VALUES (?, ?), (?, ?), (?, ?), (?, ?);
```

stats.sql (two queries):
```sql
WITH ra AS (
  SELECT a.attempt_id, a.shape_id, a.game_id, s.final_score, s.guess_shape_id
  FROM ATTEMPTS a LEFT JOIN SCORES s ON s.attempt_id = a.attempt_id
  WHERE NOT a.is_bot AND a.game_id NOT LIKE 'TEST%')
SELECT
  (SELECT COUNT(*) FROM ra) AS total_attempts,
  (SELECT COUNT(DISTINCT game_id) FROM ra) AS total_games,
  (SELECT MAX(final_score) FROM ra) AS best_ever,
  (SELECT t.name FROM ra JOIN TARGETS t ON t.shape_id = ra.shape_id
     WHERE t.is_round AND ra.final_score IS NOT NULL
     GROUP BY t.name HAVING COUNT(*) >= 5 ORDER BY AVG(ra.final_score) ASC LIMIT 1) AS hardest_shape,
  (SELECT t.label FROM ra JOIN TARGETS t ON t.shape_id = ra.guess_shape_id
     WHERE ra.guess_shape_id <> ra.shape_id
     GROUP BY t.label ORDER BY COUNT(*) DESC LIMIT 1) AS common_wrong_guess;

SELECT t.name AS shape, ROUND(AVG(s.final_score), 1) AS avg_score, COUNT(*) AS n
FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id JOIN TARGETS t ON t.shape_id = a.shape_id
WHERE NOT a.is_bot AND a.game_id NOT LIKE 'TEST%' AND t.is_round
GROUP BY t.name ORDER BY avg_score DESC;
```

## 6. Parity test (test/parity.js)
Take 10 paths from fakeAttempt in backend/ghosts.js (mixed skill) and put them in a TEST game. Snowflake and scoreRoundLocal must agree: accuracy within 0.1, the same guesses and the same ranks.

## Done when
setup.sql has run and the shapes are loaded. saveAndScoreRound matches scoreRoundLocal within 0.1 on 10 paths in under 3 s. comments, percentiles, ghostPool and gameStats all return real rows.
