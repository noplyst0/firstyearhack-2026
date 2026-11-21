-- bind: shapeId. {{LIMIT}} is replaced by snowflake.js with a checked integer (LIMIT may not take a bind).
-- Stratified ghosts (plan/V3.md): PERCENT_RANK over each stored real drawing's score puts it in a band:
--   top (>= 0.75), bottom (< 0.25), mid (the rest). Picks aim for 20% top / 60% mid / 20% bottom:
--   key = (random position within band) / band weight, so bands interleave in that ratio and a short band
--   is filled from the others. Practice, ghosts and TEST games never become ghosts.
WITH cand AS (
  SELECT a.attempt_id, s.final_score,
         PERCENT_RANK() OVER (ORDER BY s.final_score) AS pr
  FROM ATTEMPTS a JOIN SCORES s ON s.attempt_id = a.attempt_id
  WHERE a.shape_id = ? AND NOT a.is_bot AND NOT COALESCE(a.is_practice, FALSE) AND a.game_id NOT LIKE 'TEST%'),
banded AS (
  SELECT attempt_id, final_score, pr,
         CASE WHEN pr >= 0.75 THEN 'top' WHEN pr < 0.25 THEN 'bottom' ELSE 'mid' END AS band
  FROM cand),
pick AS (
  SELECT attempt_id, final_score, band,
         ROW_NUMBER() OVER (PARTITION BY band ORDER BY RANDOM()) / IFF(band = 'mid', 0.6, 0.2) AS k
  FROM banded
  ORDER BY k
  LIMIT {{LIMIT}})
SELECT p.attempt_id, ANY_VALUE(pick.band) AS band, ANY_VALUE(pick.final_score) AS score,
       ARRAY_AGG(ARRAY_CONSTRUCT(p.stroke, p.x, p.y)) WITHIN GROUP (ORDER BY p.idx) AS pts
FROM ATTEMPT_POINTS p JOIN pick ON pick.attempt_id = p.attempt_id
GROUP BY p.attempt_id;
