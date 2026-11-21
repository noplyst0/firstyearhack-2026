-- binds: shapeId, gameId, round. Backend hides the result when pool_size < 20.
WITH pool AS (
  SELECT s.attempt_id, s.final_score FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id
  WHERE a.shape_id = ? AND NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'),
me AS (
  SELECT s.attempt_id, s.final_score FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id
  WHERE a.game_id = ? AND a.round = ? AND NOT a.is_bot)
SELECT me.attempt_id,
       ROUND(100 * COUNT_IF(pool.final_score < me.final_score) / COUNT(*)) AS beat_pct,
       COUNT(*) AS pool_size
FROM me JOIN pool ON pool.attempt_id <> me.attempt_id
GROUP BY me.attempt_id;
