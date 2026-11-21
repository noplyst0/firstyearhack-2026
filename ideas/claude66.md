# claude66 ideas

## 1. Throwaway (the disposable camera, rebuilt for 2026)

**Pitch:** a browser disposable camera with 27 shots, no preview and no deleting, and the roll only "develops" when it runs out. Snowflake is the photo lab that prints your roll with captions, a story and a lab envelope.

**Track:** Retro Remix. Faithful: fixed shot count, a winding sound after each shot, a tiny viewfinder, no screen review, a film grain and light leak filter. Surprising: the lab is an AI that looks at the whole roll and writes the story of your night, picks the "best print", and flags the blurry one like a real lab sticker ("POOR EXPOSURE, NOT CHARGED"). It also fixes a real 2026 problem (camera rolls of 4,000 photos nobody looks at), which is a strong angle for "reinventive".

**Snowflake:**
- Photos go to a Snowflake internal stage, one table row per shot (roll id, shot number, time, file path).
- `AI_COMPLETE` with an image model on each photo: one line caption, mood and a 1 to 5 blur score, as JSON.
- `AI_CLASSIFY` sorts shots into "people / food / place / chaos".
- One `AI_AGG` (or `AI_COMPLETE` over all captions) writes the roll's story and picks the print of the night.
- Shared rolls: a flat or a society pools rolls, and Cortex Analyst answers "who took the most chaos shots this week" from the table. Pitch line: the photos never leave Snowflake.

**Demo moment (first 30 s):** at the start of the pitch we hand a judge a phone with 5 shots left and ask them to shoot the room. On the last shot the screen shows "Sending to the lab...", and 20 seconds later a lab envelope opens on the projector with their own photos printed, captioned and a story about "a nervous team at KCL". The judges are in the demo.

**Build plan (5 h):**
- Frontend (Antigravity): camera page (getUserMedia, canvas grain filter, shot counter, wind sound), then the envelope and prints page. Retro CSS is most of the charm, so this seat gets the most time.
- Backend (Terminal Claude): FastAPI with `POST /roll/{id}/shot` (upload to stage via the Python connector) and `POST /roll/{id}/develop` (runs the Cortex SQL, returns prints JSON).
- AI (Asim): the Cortex prompts and the JSON shape, tested on 10 sample photos by hour 2.
- Pitch: deck with a "film vs camera roll" slide.
- What could break: image Cortex calls are slow (develop 27 shots in parallel, or cap the demo roll at 12); which image models are in our region (check in the first hour, fall back to captioning only on the backend); phone camera on HTTPS (use a tunnel such as ngrok, or the laptop webcam).

**Wow 8/10. Feasibility 8/10.**

## 2. Ask Albert (the 1999 butler search engine, for KCL)

**Pitch:** a 1999 style "ask a butler" search engine (original character, Albert the Strand butler) that answers any freshers' question about KCL and London in full sentences, with the beige page, the animated GIF butler, the hit counter and the "Did you mean" box, but the answers are actually right.

**Track:** Retro Remix. Faithful: the 1999 web look and the whole "type a question, not keywords" promise. Surprising: 1999 butlers famously gave wrong answers, and 2026 AI finally delivers what they promised. Albert also replies in character ("Sir, the Maughan Library closes at midnight on weekdays") and every answer cites the KCL page it came from, shown as a 1999 blue underlined link.

**Snowflake:**
- We scrape or paste around 50 public KCL pages (library hours, societies, timetable help, wellbeing, Strand map) into a table, chunked.
- Cortex Search service over the chunks for retrieval.
- A Cortex Agent combining that Search service with Cortex Analyst over one small table (opening hours, room codes, society fair stalls), so "is the library open at 11pm Tuesday" is answered from data, not guessed.
- `AI_COMPLETE` turns the agent's answer into butler voice.
- "Popular questions today" ticker comes from a query log table in Snowflake.

**Demo moment (first 30 s):** the projector shows a perfect 1999 page with a MIDI loading sound. A judge types a real question ("where do I print in Bush House?"). Albert bows (GIF), answers in character and shows the source link. Then we ask a trick question and he says "I'm afraid I don't know, sir" instead of making it up.

**Build plan (5 h):**
- Frontend: one static 1999 page (tables layout, Comic Sans, marquee, counter), plus the answer box. About 2 hours of work.
- Backend: `POST /ask` calls the Cortex Agent REST API and returns answer, sources and a "butler mood".
- Data and AI: scrape pages (hour 1), load and chunk, create the Search service, write the agent instructions (hour 2 to 3).
- What could break: Cortex Agent setup takes longer than expected (fallback: Cortex Search plus one `AI_COMPLETE` call, still a real RAG); scraped pages are messy (paste text by hand for the top 20); judges may see it as "a chatbot with a skin", so the pitch must lean on the 1999 promise and the cited sources.

**Wow 6/10. Feasibility 9/10.** Strongest Snowflake prize story of the three, weakest wow.

## 3. Commute Composer (your Tube journey becomes a song)

**Pitch:** pick two London Underground stations and get the song of your journey: every stop is a note, every line change is a key change, busy stations are louder, and an AI writes one lyric per stop from that station's history. It ends with a generated album cover and a track listing.

**Track:** Creative Tech / Code Meets Culture. Very London, everyone in the room has done the journey, and it turns the most boring part of student life into music. Wacky enough to stand out, rooted in real culture (station names, history, line colours).

**Snowflake:**
- Station table with line, zone, depth, opening year and step free status (TfL open data CSV, licence to check on the TfL page first), plus a passenger count column if the TfL usage figures load in time.
- `AI_COMPLETE` pre-generates one short lyric per station from its name, opening year and a short history blurb (one batch query over around 270 rows, done once and cached in a table).
- `AI_CLASSIFY` gives each station a mood (grand, gloomy, chaotic, posh), which picks the chord type.
- Cortex Analyst answers playful questions on stage: "which line is the saddest song?" or "longest song with no key change?".
- Route search can be simple shortest path in Python (Snowpark) or done on the backend.

**Demo moment (first 30 s):** "Strand to Stratford", the projector draws the route on a Tube style map, a dot moves stop by stop, each stop plays a note and shows its lyric, the key changes at the line change, and an album cover with the track list appears. Then a judge picks their own commute.

**Build plan (5 h):**
- Frontend: SVG Tube style map (no official map, draw our own simple lines), Tone.js for notes and chords, album cover page.
- Backend: `GET /song?from=&to=` returns ordered stops with note, chord, volume and lyric from Snowflake.
- Data and AI: load stations and connections (hour 1), batch lyrics and moods with Cortex (hour 2), mapping from data to music (hour 3).
- What could break: station connection data is the hard part (limit the demo to 3 or 4 lines if it gets messy); audio can sound random rather than musical (lock notes to one scale per line so it always sounds fine); the official Tube map design and roundel are trademarks, so draw our own style.

**Wow 7/10. Feasibility 7/10.**

## My pick
Throwaway. The judge-takes-the-photos moment is the most memorable 30 seconds, it is clearly faithful and surprising for Retro Remix, and image analysis in Cortex is a less common Snowflake use than a chatbot, which helps the side prize.
