-- two queries: headline numbers, then average score per round shape
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
