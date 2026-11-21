-- bind: shapeId. {{LIMIT}} is replaced by snowflake.js with a checked integer (LIMIT may not take a bind).
WITH pick AS (
  SELECT attempt_id FROM ATTEMPTS
  WHERE shape_id = ? AND NOT is_bot AND game_id NOT LIKE 'TEST%'
  ORDER BY RANDOM() LIMIT {{LIMIT}})
SELECT p.attempt_id, ARRAY_AGG(ARRAY_CONSTRUCT(p.stroke, p.x, p.y)) WITHIN GROUP (ORDER BY p.idx) AS pts
FROM ATTEMPT_POINTS p JOIN pick ON pick.attempt_id = p.attempt_id
GROUP BY p.attempt_id;
