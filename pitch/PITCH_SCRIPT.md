# SkySketch pitch script (about 3 minutes)

Two speakers: **A** runs the laptop and talks the demo, **B** talks the tech and the why.
Before you start: big screen open on /host, room created, QR showing, 20 ghosts added, phone volume up.
Fill in the [brackets] with real numbers before pitching.

---

## 1. Open with the game (0:00 to 0:20) · A
"Phones out. Scan the QR code on the screen. Pick a name or hit the dice.
Your phone is now a laser pointer. Hold your thumb down to draw, lift it to stop.
First round is practice, so you can see your line. After that, you draw blind."

*(Press Start. Let the practice round run.)*

## 2. Real round (0:20 to 1:10) · A
"Now the real one. Square. You can't see your line any more, so trust your wrist."

*(Square round. While it runs:)*

"Every drawing is going straight into Snowflake."

*(Judging screen shows the distance checks counter.)*

"That's Snowflake checking every point of every drawing against every shape we know. Around 278,000 checks per player, done in about 2 seconds."

*(Reveal, worst to best. Let the room laugh at the bad ones. Read out one guess: "Snowflake thinks that was a potato".)*

## 3. What you just saw (1:10 to 1:50) · B
"So how does it work?
The phone has no idea where it is in the room, but it knows which way it's pointing. We read the gyroscope in the browser, turn that into a dot, and record where you drew.
No app and no account. Just a web page.

Then Snowflake does the judging. Every drawing goes into a table. One SQL query compares it to the target shape both ways: did you stay on the line, and did you cover the whole shape. It's pure geometry, so the same drawing always gets the same score.
The same query also ranks the room and guesses what you actually drew.

Everything is stored, so Snowflake also gives us ghosts from earlier players, percentiles like 'better than [x]% of today's squares', and the stats at the end."

## 4. Crowd drawing + podium (1:50 to 2:20) · A
*(Crowd drawing slide.)*
"This white line is everyone's drawings blended into one. The average player got [x]%. The whole room blended got [y]%. The crowd is a better artist than any of us."

*(Podium: 3rd, 2nd, drum roll, winner.)*

## 5. Why it matters (2:20 to 2:50) · B
"It's a party game, but the maths is real.
Steadiest hands on that screen is an actual tremor measurement. The same scoring could track hand control during rehab after an injury, or be a quick steady-hand warm-up, with a score that isn't anyone's opinion.

For the Retro Remix track: motion-controller party games used to need a console, a sensor bar and a controller each, for four players. We rebuilt it so the controller is the phone already in your pocket and the whole room plays at once.

We soft launched it here today: [N] players and [M] drawings so far."

## 6. Close (2:50 to 3:00) · A
*(Final screen with the Snowflake stats.)*
"SkySketch. Your phone is the controller, the room is the player and Snowflake is the referee."

---

## If a judge asks
- **AI or opinion?** Neither. Geometry, same drawing same score.
- **Why not real arm tracking?** Phones can't measure position, the accelerometer drifts within a second or two. Pointing doesn't drift.
- **Why Snowflake?** It keeps every drawing, so ghosts, percentiles and stats work across games, and one query scores the whole room.
- **Snowflake AI?** Blocked on trial accounts, so we did everything in SQL and the jokes are built from each player's stats.
- **If Snowflake is down?** Same maths runs locally and the game keeps going.
- **How did two people build it in a day?** Six AI agents in JetBrains Air, each in its own folder, working from one shared plan in the repo.

## Backup plan
- If the tunnel link dies: run `cloudflared tunnel --url http://localhost:3000` and make a new room.
- If phones won't join: play with `?mouse=1` on a laptop tab and keep talking.
- Don't restart the server once you start pitching.
