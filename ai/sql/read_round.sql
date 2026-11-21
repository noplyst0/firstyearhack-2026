-- binds: gameId, round
SELECT s.attempt_id, s.accuracy, s.on_line, s.coverage, s.final_score, s.rank_in_round, s.points_awarded,
       s.guess_shape_id, t.label AS guess_label, s.guess_score
FROM SCORES s JOIN ATTEMPTS a ON a.attempt_id = s.attempt_id JOIN TARGETS t ON t.shape_id = s.guess_shape_id
WHERE a.game_id = ? AND a.round = ? AND s.scorer = 'snowflake';
