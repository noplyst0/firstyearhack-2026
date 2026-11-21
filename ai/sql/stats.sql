-- game:end stats (plan/V3.md contract 4). Six statements, run in this order by snowflake.js gameStats().
-- "Real" attempts everywhere: not a ghost, not practice, not a TEST game.
-- Statements 3 and 4 take binds (gameId, gameId): NULL = all-time, otherwise this game only.

-- 1. headline: totalAttempts, totalGames, hardestShape (round shape with the lowest average, needs 5+ drawings)
WITH ra AS (
  SELECT a.attempt_id, a.shape_id, a.game_id, s.final_score
  FROM ATTEMPTS a LEFT JOIN SCORES s ON s.attempt_id = a.attempt_id
  WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%')
SELECT
  (SELECT COUNT(*) FROM ra) AS total_attempts,
  (SELECT COUNT(DISTINCT game_id) FROM ra) AS total_games,
  (SELECT t.name FROM ra JOIN TARGETS t ON t.shape_id = ra.shape_id
     WHERE t.is_round AND ra.final_score IS NOT NULL
     GROUP BY t.name HAVING COUNT(*) >= 5 ORDER BY AVG(ra.final_score) ASC LIMIT 1) AS hardest_shape;

-- 2. bestEver: the single best real drawing of all time, with who drew it and which shape
SELECT COALESCE(a.player_name, a.player_id) AS name, s.final_score AS score, t.name AS shape
FROM ATTEMPTS a
JOIN SCORES s ON s.attempt_id = a.attempt_id
JOIN TARGETS t ON t.shape_id = a.shape_id
WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'
QUALIFY ROW_NUMBER() OVER (ORDER BY s.final_score DESC, a.submitted_at ASC) = 1;

-- 3. steadiest: lowest tremor. Per stroke, heading = ATAN2 of each step (LAG over idx); turn = change in heading,
--    wrapped to [-pi, pi]; tremor = STDDEV of the turns per drawing (degrees), averaged per player. Lower = steadier.
WITH pts AS (
  SELECT p.attempt_id, p.stroke, p.idx, p.x, p.y, COALESCE(a.player_name, a.player_id) AS name
  FROM ATTEMPT_POINTS p JOIN ATTEMPTS a ON a.attempt_id = p.attempt_id
  WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'
    AND (? IS NULL OR a.game_id = ?)),
heading AS (
  SELECT attempt_id, stroke, idx, name,
         ATAN2(y - LAG(y) OVER (PARTITION BY attempt_id, stroke ORDER BY idx),
               x - LAG(x) OVER (PARTITION BY attempt_id, stroke ORDER BY idx)) AS theta
  FROM pts),
turn AS (
  SELECT attempt_id, name,
         theta - LAG(theta) OVER (PARTITION BY attempt_id, stroke ORDER BY idx) AS d
  FROM heading WHERE theta IS NOT NULL),
per_attempt AS (
  SELECT attempt_id, name, DEGREES(STDDEV(d - 2 * PI() * ROUND(d / (2 * PI())))) AS tremor
  FROM turn WHERE d IS NOT NULL
  GROUP BY attempt_id, name)
SELECT name, ROUND(AVG(tremor), 1) AS tremor, COUNT(*) AS n
FROM per_attempt
GROUP BY name
QUALIFY ROW_NUMBER() OVER (ORDER BY AVG(tremor) ASC) = 1;

-- 4. mostImproved: biggest jump from one real round to the next for the same player in the same game (LAG over rounds)
WITH r AS (
  SELECT COALESCE(a.player_name, a.player_id) AS name, a.game_id, a.player_id, a.round, s.final_score,
         s.final_score - LAG(s.final_score) OVER (PARTITION BY a.game_id, a.player_id ORDER BY a.round) AS gain
  FROM ATTEMPTS a JOIN SCORES s ON s.attempt_id = a.attempt_id
  WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'
    AND (? IS NULL OR a.game_id = ?))
SELECT name, ROUND(gain, 1) AS gain, round
FROM r
WHERE gain > 0
QUALIFY ROW_NUMBER() OVER (ORDER BY gain DESC) = 1;

-- 5. confusion: for each round shape, how often Snowflake's best guess was a different shape; report the worst pair
--    ("38% of stars looked like a potato"). Needs 3+ drawings of that shape.
WITH ra AS (
  SELECT a.shape_id, s.guess_shape_id
  FROM ATTEMPTS a JOIN SCORES s ON s.attempt_id = a.attempt_id
  WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'
    AND s.guess_shape_id IS NOT NULL),
m AS (
  SELECT shape_id, guess_shape_id, COUNT(*) AS n,
         SUM(COUNT(*)) OVER (PARTITION BY shape_id) AS total
  FROM ra GROUP BY shape_id, guess_shape_id)
SELECT t.name AS shape, g.label AS label, ROUND(100 * m.n / m.total) AS pct, m.n, m.total
FROM m
JOIN TARGETS t ON t.shape_id = m.shape_id
JOIN TARGETS g ON g.shape_id = m.guess_shape_id
WHERE m.guess_shape_id <> m.shape_id AND m.total >= 3 AND t.is_round
QUALIFY ROW_NUMBER() OVER (ORDER BY m.n / m.total DESC, m.n DESC) = 1;

-- 6. perShape: average score per round shape
SELECT t.name AS shape, ROUND(AVG(s.final_score), 1) AS avg_score, COUNT(*) AS n
FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id JOIN TARGETS t ON t.shape_id = a.shape_id
WHERE NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%' AND t.is_round
GROUP BY t.name ORDER BY avg_score DESC;
