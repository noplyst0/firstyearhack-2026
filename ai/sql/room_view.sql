-- binds: gameId, round. Room view for round:extras (plan/V3.md contract 3). One row per target point (256).
-- For every drawing and every target point: nearest drawn point (MIN distance, MIN_BY for its x/y).
-- heat = average miss per target point, scaled so the most-missed point = 1.
-- crowd = average of those nearest points: the room's consensus line, then Chamfer-scored against the target.
-- alone = the room's average real score this round.
WITH att AS (
  SELECT a.attempt_id, a.shape_id, p.x, p.y
  FROM ATTEMPTS a JOIN ATTEMPT_POINTS p ON p.attempt_id = a.attempt_id
  WHERE a.game_id = ? AND a.round = ? AND NOT a.is_bot),
shape AS (SELECT ANY_VALUE(shape_id) AS shape_id, ANY_VALUE(attempt_id) AS any_attempt FROM att),
tp AS (
  SELECT t.idx, t.x, t.y FROM TARGET_POINTS t JOIN shape s ON t.shape_id = s.shape_id),
pairs AS (
  SELECT att.attempt_id, tp.idx, att.x, att.y, SQRT(SQUARE(att.x - tp.x) + SQUARE(att.y - tp.y)) AS d
  FROM att CROSS JOIN tp),
nearest AS (
  SELECT attempt_id, idx, MIN(d) AS d, MIN_BY(x, d) AS nx, MIN_BY(y, d) AS ny
  FROM pairs GROUP BY attempt_id, idx),
per_idx AS (
  SELECT idx, AVG(d) AS miss, AVG(nx) AS cx, AVG(ny) AS cy FROM nearest GROUP BY idx),
c2t AS (   -- crowd point -> nearest target point
  SELECT c.idx, MIN(SQRT(SQUARE(c.cx - tp.x) + SQUARE(c.cy - tp.y))) AS d
  FROM per_idx c CROSS JOIN tp GROUP BY c.idx),
t2c AS (   -- target point -> nearest crowd point
  SELECT tp.idx, MIN(SQRT(SQUARE(c.cx - tp.x) + SQUARE(c.cy - tp.y))) AS d
  FROM tp CROSS JOIN per_idx c GROUP BY tp.idx),
crowd AS (
  SELECT GREATEST(0, 100 * (1 - (((SELECT AVG(d) FROM c2t) + (SELECT AVG(d) FROM t2c)) / 2) / cfg.v)) AS crowd_score
  FROM CONFIG cfg WHERE cfg.k = 'D_MAX'),
alone AS (
  SELECT AVG(s.final_score) AS alone
  FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id
  WHERE a.game_id = ? AND a.round = ? AND NOT a.is_bot)
SELECT p.idx, p.miss / NULLIF(MAX(p.miss) OVER (), 0) AS heat, p.cx, p.cy,
       ROUND(crowd.crowd_score, 1) AS crowd_score, ROUND(alone.alone, 1) AS alone
FROM per_idx p CROSS JOIN crowd CROSS JOIN alone
ORDER BY p.idx;
