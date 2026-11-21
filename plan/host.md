# SEAT: HOST · Codex · folder frontend/host/ (served at /host) · branch codex-host
Read plan/SHARED.md first. Big screen, readable from the back of a lecture theatre. Look: bright 2000s party style (rounded panels, big bouncy type, high contrast) around a dark drawing board. No console logos or brand names.

## Files
index.html, host.css, host.js (screens + socket), overlay.js (drawing + reveal), sounds.js (WebAudio, no audio files).
- socket.io from /socket.io/socket.io.js with io({ transports: ['websocket'] }).
- QR library: https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
- Confetti (optional): https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js

## Screens
1. Lobby
   - Huge room code. QR code pointing to `${location.origin}/?code=${code}`, with the URL as text underneath.
   - Player chips pop in (ghosts marked 👻). Tapping a chip's ✕ twice kicks that player.
   - Rounds selector (3 or 5), an "Add 20 ghosts" button (host:bots) and START. The START tap also unlocks WebAudio.
   - Snowflake pill from GET /health every 10 s: "Snowflake ✓" or "Local mode".
   - Use host:create { test: true } when the URL has ?test=1. Keep the code in sessionStorage and reclaim the room with host:create { code } after a refresh.
2. Round
   - Target drawn big from targetStrokes: thick neon line on a dark grid.
   - Label "Round 2 of 3 · Triangle · ★★".
   - Countdown 3-2-1-GO with beeps.
   - Memory round: "MEMORY ROUND" banner, and the shape vanishes with a poof at GO.
   - Timer bar, and "x / N drawings in" from round:progress.
3. Judging (on round:judging)
   - "Snowflake is judging..." with distanceChecks counting up ("1,843,200 distance checks").
   - Once results arrive, a small caption: "Judged by Snowflake in {judgeMs/1000} s". Show nothing when the scorer is local.
4. Results: the reveal (never longer than 12 s)
   - Draw targetNorm in grey. Map normalised points to the board: centre of the board, scale = min(width, height) / 5, y down.
   - Ghost paths faint (20% white), all at once.
   - Real players one at a time from LAST place to FIRST: each path draws on, the name sits at the end of the line, the % counts up. With 8 or fewer real players, about 1 s each. With more than 8: the bottom 3 one by one, the middle all together, then 3rd and 2nd.
   - Winner last: drum roll, gold path, confetti, a banner "WINNER {name} {score}%" with their comment.
   - Then the ranked list (top 10 real players):
     - rank, name and %
     - two thin bars (on the line / covered)
     - the guess line
     - the comment for featured players ("..." until round:extras)
     - +points
   - Footer: "{n} ghosts from earlier today, best ghost {x}%".
   - Next round button (the server auto-advances after 15 s).
5. Final (on game:end)
   - Podium for the top 3 and the full leaderboard.
   - Snowflake stats panel: drawings today, games today, best score ever, hardest shape, average per shape, most common accidental shape.
   - Play again button (host:again).
6. Colours: 10 distinct high-contrast colours for real players, gold for the winner, faint white for ghosts. Names always sit next to lines, so colour is never the only signal.
7. Sounds (WebAudio): join pop, countdown beeps, GO, drum roll, fanfare, plus a mute toggle.

## Done when
- Readable from 10 m.
- 30 ghosts + 3 phones render smoothly.
- The reveal never goes over 12 s.
- Kick works.
- A refresh mid-game reclaims the room.
