-- binds: gameId, round. Practice attempts (v3) keep their rank but get 0 points. Scores every valid drawing against every library shape: own-shape accuracy + best guess in one pass.
-- UNTESTED until the login arrives. If Snowflake rejects WITH inside INSERT, wrap as INSERT INTO SCORES (...) SELECT * FROM (WITH ... SELECT ...).
INSERT INTO SCORES (attempt_id, accuracy, on_line, coverage, final_score, rank_in_round,
                    points_awarded, guess_shape_id, guess_score, scorer)
WITH att AS (
  SELECT a.attempt_id, a.shape_id, a.is_bot, COALESCE(a.is_practice, FALSE) AS is_practice, a.submitted_at, p.idx, p.x, p.y
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
  SELECT a.attempt_id, a.is_bot, a.is_practice, a.submitted_at, acc.accuracy, acc.on_line, acc.coverage
  FROM (SELECT DISTINCT attempt_id, shape_id, is_bot, is_practice, submitted_at FROM att) a
  JOIN acc ON acc.attempt_id = a.attempt_id AND acc.cand = a.shape_id),
ranked AS (
  SELECT mine.*, ROW_NUMBER() OVER (PARTITION BY is_bot
           ORDER BY accuracy DESC, coverage DESC, submitted_at ASC) AS rn
  FROM mine)
SELECT r.attempt_id, r.accuracy, r.on_line, r.coverage, ROUND(r.accuracy, 1),
       IFF(r.is_bot, NULL, r.rn),
       IFF(r.is_bot OR r.is_practice, 0, CASE r.rn WHEN 1 THEN 300 WHEN 2 THEN 200 WHEN 3 THEN 100 ELSE 50 END),
       g.guess_shape_id, g.guess_score, 'snowflake'
FROM ranked r JOIN guess g ON g.attempt_id = r.attempt_id;
