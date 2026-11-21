# STRETCH (after the 15:30 freeze only)
Work on `<your branch>-stretch` (for example claude-backend-stretch). The Lead merges only if it's safe.
Each part names the folders it touches, and each folder's seat does that part: backend = Claude Agent, phone = Argon, host = Codex, ai = Asim's Claude.
Order: A room view, B judge's shape, C shake to clear, D vision verdict. 30 minute time box each.

## A. Room view ("where the room went wrong") · ai + backend + host
- ai: roomView() runs sql/room_view.sql (binds: gameId, round):
```sql
WITH att AS (
  SELECT p.attempt_id, p.x, p.y, a.shape_id
  FROM ATTEMPTS a JOIN ATTEMPT_POINTS p ON p.attempt_id = a.attempt_id
  WHERE a.game_id = ? AND a.round = ? AND NOT a.is_bot),
near AS (
  SELECT att.attempt_id, t.idx AS t_idx,
         MIN(SQRT(SQUARE(att.x - t.x) + SQUARE(att.y - t.y))) AS d,
         MIN_BY(att.x, SQRT(SQUARE(att.x - t.x) + SQUARE(att.y - t.y))) AS nx,
         MIN_BY(att.y, SQRT(SQUARE(att.x - t.x) + SQUARE(att.y - t.y))) AS ny
  FROM att JOIN TARGET_POINTS t ON t.shape_id = att.shape_id
  GROUP BY att.attempt_id, t.idx)
SELECT t_idx, AVG(d) AS miss, AVG(nx) AS crowd_x, AVG(ny) AS crowd_y
FROM near GROUP BY t_idx ORDER BY t_idx;
```
- ai: roomVerdict() (binds: instruction, note1, note2, ...; if the bind is rejected, write the instruction into the SQL with its quotes escaped):
```sql
SELECT AI_AGG(column1, ?) AS verdict FROM VALUES (?), (?), (?);
```
  instruction: "Each row describes how one player traced a {shape} in the air without seeing their line. Write one kind, funny sentence (max 20 words) about how the whole room did."
- backend: after results, call roomView (3 s timeout) and score the crowd line with scoreAgainst against targetNorm. Then call roomVerdict (3 s timeout) with one note per real player. Send round:extras { heat, crowd: { path, score }, verdict }.
- host: add a "Room view" slide after the list:
  - the target outline coloured by heat (green = everyone hit it, red = everyone missed it)
  - the crowd line in thick white
  - "Alone you averaged {avg}%. Together: {crowd.score}%"
  - the verdict underneath

## B. Judge's shape · host + backend + ai
- host: a "Judge's shape" button in the lobby and on results. It opens a drawing pad (pointer events, strokes in 0..1) and a name box (default "the judge's doodle"). "Use it next" sends host:customShape { code, name, strokes }.
- backend: run resampleStrokes + normaliseStrokes; an invalid doodle returns an error in the ack. Give the shape id 1000+ and insert it as the next round (duration 15 s). Call snowflake.saveTarget fire and forget: if it isn't saved in time, Snowflake returns no rows and the local fallback scores the round. Ack { ok, shapeId, guess } with guess = guess(norm, library, shapeId, D_MAX), and the host shows "Snowflake thinks the judge drew {label}".

## C. Shake to clear · phone + backend + host
- backend: on host:next, open a shake phase with room:shake { count: 0, total, open: true }. Count unique shakers. Close at 60% of connected real players or after 6 s with room:shake { count, total, open: false }, and start the next round 1.5 s later.
- phone: show "SHAKE TO CLEAR!". Watch devicemotion accelerationIncludingGravity: when |magnitude - 9.81| > 12 three times within 1 s, send player:shake once and vibrate 80 ms. The motion permission already came from the JOIN tap.
- host: the board shakes and wipes clean as the count fills a bar.

## D. Vision verdict (winner only) · host + backend + ai
- host: after the reveal, render the winner's pathStrokes in black on white, 512 × 512, 8 px lines. Send host:snapshot { code, round, playerId, png: canvas.toDataURL('image/png') }.
- backend: decode the PNG to /tmp/skysketch/<gameId>-<round>.png and call visionGuess (8 s timeout). Send round:extras { vision: { playerId, text } }. The host adds "Snowflake's eyes say: {text}" to the winner banner.
- ai:
```sql
PUT 'file:///tmp/skysketch/<file>.png' @SKY_IMAGES AUTO_COMPRESS = FALSE OVERWRITE = TRUE;   -- PUT gzips by default
SELECT AI_COMPLETE('<SNOWFLAKE_VISION_MODEL>',
  'This is a line drawing someone traced in the air without seeing it. Say what it looks like in at most 6 playful words.',
  TO_FILE('@SKY_IMAGES', '<file>.png')) AS verdict;
```
  Use an image model your account lists (for example claude-haiku-4-5). One image per call, and the stage must use SNOWFLAKE_SSE. Don't use an outside vision API: the prize needs Snowflake to do the AI work.
