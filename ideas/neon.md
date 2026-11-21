# Ideas — Neon

Three original pitches for FirstYearHack 2026 (5-hour build, 2 first-year CS students + 6 AI agents, JetBrains Air, targeting both a main track and the Snowflake side prize).

---

## 1. Ceefax 2026

**One-line pitch:** A faithful 1990s BBC Ceefax / Teletext CRT broadcast in your browser where every 40×24 colour-block page—including a live trivia channel and an on-demand "Dial-a-Page" AI broadcast—is dynamically authored from real 2026 cultural data inside Snowflake.

### Track & Why It Scores
- **Track:** Retro Remix / Old Tech, New Tricks
- **Faithful:** Authentic 40×24 monospace Teletext grid, strict 8-colour palette, double-height headers, chunky mosaic block graphics, spinning `P100` page-seek ticker, clickable TV remote with numeric keypad + Red/Green/Yellow/Blue Fastext buttons, and optional Web Audio CRT hum / "Pages from Ceefax" synth loop.
- **Reinventive & surprising:** Instead of static broadcast loops, dialing `P777` lets anyone type a 2026 question and watch a Snowflake Cortex Agent compile a brand-new, cross-linked Teletext broadcast page on the fly; dialing `P555` launches **Bamboozle! 2026**, an infinite trivia game generated from live cultural datasets. Instant nostalgic hit with UK/London judges.

### How Snowflake Is Used
- **Snowflake Tables (Curated Culture Feeds):** Load structured tables of UK/global culture, film & music charts, London venues/spots, and pop-culture trivia facts.
- **Cortex AISQL (`AI_COMPLETE`):** Runs directly in SQL to condense raw rows into strict 40-char British Ceefax copy, double-height headlines, and 4-option Bamboozle trivia rounds.
- **Cortex Search:** Hybrid keyword + vector search over a curated corpus of UK music, cinema, and London culture docs so custom pages cite real, grounded facts.
- **Cortex Analyst (Semantic View):** Turns plain-English questions into SQL aggregations for chart/leaderboard pages (`P302` Culture Charts), rendered as Teletext mosaic bar charts.
- **Cortex Agents:** Powers `P777` ("Dial-a-Page"), orchestrating Cortex Search + Cortex Analyst in one call to answer open-ended queries and output a structured Teletext page plus 4 Fastext drill-down subpages.
- **Governance pitch:** All retrieval, SQL analytics, and LLM synthesis execute inside Snowflake—the underlying data never leaves the platform.

### Demo Moment (First 30 Seconds)
1. Judges see a glowing 4:3 CRT TV on screen at `P100 INDEX` with neon pixel-block typography and a clickable TV remote beside it.
2. We punch `5-5-5` on the remote: the page counter rattles through numbers and snaps to **BAMBOOZLE! 2026**, and a judge presses a **RED / GREEN / YELLOW / BLUE** Fastext button to answer a live Cortex-generated question.
3. We punch `7-7-7` and type *"Top 90s cult sci-fi films + indie cinemas in London"*: the authentic `P777` ticker spins for ~2 seconds while Snowflake Cortex Agent runs SQL + search, then snaps into a colour-coded Ceefax broadcast complete with a mosaic rating chart and clickable Fastext follow-ups.

### 5-Hour Build Plan (2 People + Agents)
- **Frontend (`frontend/` — Argon + Neon, Hours 0–3.5):** React + Vite CRT bezel, strict 40×24 Teletext grid renderer driven by one clean JSON schema (`{pageNum, title, rows[], fastext}`), clickable remote + keyboard number entry, spinning seek animation, and lightweight Web Audio bleeps.
- **Backend (`backend/` — Codex + Claude Agent, Hours 0–3):** FastAPI server with `/api/page/{num}`, `/api/bamboozle`, and `/api/dial` calling Snowflake via Python connector / REST API; enforces the 40-char column sanitizer and caches hot pages (`P100`–`P555`) in memory for instant flicking.
- **Data & Snowflake (`ai/` + Snowsight — Asim + Codex, Hours 0–2.5):** Set up Snowflake trial warehouse, load 3 clean CSV/JSON cultural datasets, pre-generate index pages via `AI_COMPLETE`, and create 1 Cortex Search service + 1 Semantic View (Cortex Analyst) + 1 Cortex Agent. Freeze and deploy by 15:30.
- **What could break (and mitigations):**
  - *Cortex Agent latency (4–8s):* Disguise naturally with the iconic spinning Teletext page-search counter (`P777 -> P778 -> ...`), and pre-cache `P100`–`P555`.
  - *LLM breaking the 40-column grid:* Enforce structured JSON output in `AI_COMPLETE` plus a deterministic backend wrapper/truncator.
  - *Trial account Agent tool restrictions:* Verify Cortex Agent permissions in hour 1; fallback cleanly to backend SQL calls combining Cortex Search + Cortex Analyst + `AI_COMPLETE`.

### Honest Scores
- **Wow factor:** 8.5 / 10 (instantly iconic UK nostalgia, tactile remote + quiz, clever contrast between 1980s UI and 2026 Snowflake AI).
- **Feasibility:** 9 / 10 (a 40×24 monospace UI is fast to make pixel-perfect, and a single JSON page contract cleanly decouples frontend from backend).

---

## 2. Culture Collider

**One-line pitch:** A glowing particle accelerator for culture where you smash any two eras, genres, or artworks—or a live photo of your own outfit—together to synthesize an impossible new micro-genre complete with a playable synth loop, generative gig poster, and real historical "bridge" films, tracks, and art from Snowflake.

### Track & Why It Scores
- **Track:** Creative Tech / Code Meets Culture
- **Creative / wacky:** Turns culture into subatomic physics—drag two orbs (e.g., *1960s French New Wave* + *2000s UK Grime*, or *Studio Ghibli* + *Brutalist Architecture*) into a CERN-style collider ring and detonate them, or snap a live photo of a judge's jacket/stickers to collide *them* with any cultural movement.
- **Connecting with culture:** Never just invents disconnected fluff—anchors every collision in real films, albums, art movements, and quotes that genuinely bridge the two worlds, while building a live hackathon-wide "Cultural Particle Tree" of every mashup created during the day.
- **Cool experience:** One-click multi-sensory payoff: particle shockwave animation, an editorial SVG gig poster, a live Web Audio synth motif playing at the invented genre's BPM/scale, and clickable real cultural works you can re-collide infinitely.

### How Snowflake Is Used
- **Snowflake Tables + Internal Stage:** Store ~1,500–2,000 curated rows across `FILMS`, `MUSIC_TRACKS`, `ART_MOVEMENTS`, and `CULTURAL_QUOTES`, plus an internal stage for uploaded/webcam judge photos.
- **Multimodal Cortex AISQL (`AI_COMPLETE` on staged images):** Analyses a judge's uploaded photo directly inside Snowflake SQL (`TO_FILE('@VIBE_STAGE', ...)`) to extract aesthetic tags, colour palette, and era vibes—zero external vision APIs.
- **Cortex Search:** Hybrid vector + keyword search across the unified `CULTURE_CORPUS` to retrieve real-world "bridge" films, songs, and artworks sitting halfway between the two colliding inputs.
- **Cortex AISQL (`AI_COMPLETE` structured JSON):** Synthesizes the collided micro-genre directly in SQL: movement name, 2-sentence manifesto, dress code, 4-hex palette, poster layout hints, and a constrained musical JSON spec (`bpm`, `scale`, `chords`, `synthType`) for the browser audio engine.
- **Snowflake Analytics + Streamlit in Snowflake (optional companion):** Logs every collision to a `COLLISIONS` table, computes a SQL "Cultural Distance Score" (era/medium gap), and powers a live leaderboard of the hackathon's wildest collisions.

### Demo Moment (First 30 Seconds)
1. Judges see a dark-mode glowing particle collider ring surrounded by floating cultural orbs (*Wong Kar-wai*, *UK Garage*, *Bauhaus*, *Victorian Gothic*, *City Pop*, *Cyberpunk*) plus a **"SNAP YOUR VIBE"** camera button.
2. We snap a quick photo of a judge's hoodie (or let them pick an orb), pair it with *1970s Japanese City Pop*, and slam **COLLIDE**.
3. The orbs accelerate and flash -> a bold custom gig poster snaps onto screen, a groovy 114 BPM Web Audio synth loop starts playing immediately, a sharp manifesto names the new subculture, and 4 real bridge films/tracks/artworks retrieved via Snowflake Cortex Search pop up as clickable cards ready for the next collision.

### 5-Hour Build Plan (2 People + Agents)
- **Frontend (`frontend/` — Argon + Neon, Hours 0–3.5):** React + Canvas/CSS collider ring, orb picker + webcam capture (resized client-side to 512px JPEG), 4 curated parametric SVG poster templates (Swiss, Brutalist, Risograph, Vaporwave) driven by Cortex JSON, and a Tone.js / Web Audio 4-bar chord+bass+beat synth engine.
- **Backend (`backend/` — Codex + Claude Agent, Hours 0–3):** FastAPI endpoints `/api/particles`, `/api/upload-vibe` (stages image to Snowflake + runs multimodal `AI_COMPLETE`), `/api/collide` (Cortex Search for bridges + `AI_COMPLETE` for genre/music JSON + logs to `COLLISIONS`), and `/api/tree` (recent collision graph).
- **Data & Snowflake (`ai/` + Snowsight — Asim + Codex, Hours 0–2.5):** Assemble and load clean CSVs (films, albums/tracks, art/fashion movements, quotes), create Cortex Search service over `CULTURE_CORPUS`, verify multimodal `AI_COMPLETE` on staged JPEGs, and spin up a lightweight Streamlit in Snowflake analytics view for the Snowflake judges. Freeze by 15:30.
- **What could break (and mitigations):**
  - *Generated synth loops sounding dissonant:* Restrict Cortex output to 6 pre-vetted musical scales, safe chord progressions, and 85–130 BPM so every loop sounds genuinely good.
  - *Webcam upload failing or lagging on venue Wi-Fi:* Compress to <50KB JPEG client-side and keep 6 pre-staged sample photos as instant 1-click fallbacks.
  - *Ugly generative posters:* Never let the LLM output raw SVG paths—use 4 handcrafted geometric poster templates and let Snowflake supply only text, palette, and layout parameters.

### Honest Scores
- **Wow factor:** 9.5 / 10 (visual + musical + live judge photo interaction + genuinely clever cultural synthesis; massive main-track & Snowflake multimodal appeal).
- **Feasibility:** 7.5 / 10 (more moving parts—animation, synth, image staging, poster templates—so tight template/audio constraints are key to hitting the 15:30 freeze).

---

## 3. Interpol '95: The Cultural Heist

**One-line pitch:** A 1995 Windows-95 detective game—reinventing *Where in the World is Carmen Sandiego?* for 2026—where you crack art, film, and music heists by interrogating AI witnesses and querying a retro Interpol CRT mainframe backed by Snowflake Cortex Agents.

### Track & Why It Scores
- **Track:** Retro Remix / Old Tech, New Tricks
- **Faithful:** Authentic Windows 95 / 90s CD-ROM Encarta interface (beveled grey windows, teal desktop, pixelated Interpol badges, Polaroid corkboard, clunky click sounds, and an animated red **"ISSUE WARRANT"** rubber stamp).
- **Reinventive & surprising:** Replaces hardcoded 90s clue menus with free-text detective queries into a live Snowflake Cortex Agent mainframe and real-time witness interrogations—grounded in real global art, cinema, and music history—plus a **"New Heist Generator"** that builds a fresh solvable case around any cultural theme a judge names.

### How Snowflake Is Used
- **Snowflake Relational Tables (Cultural World Graph):** Clean relational schema of `SUSPECTS` (traits, tastes, alibis), `CITIES` (landmarks, local music/cinema), `ARTIFACTS` (famous paintings, master tapes, iconic film props), and `DOSSIERS` (unstructured lore & witness notes).
- **Cortex Analyst (Semantic View):** Translates the player's plain-English mainframe queries (*"Which suspect loves 1970s Krautrock and flew to a city with a Gaudí basilica?"*) into live SQL joins across `SUSPECTS`, `CITIES`, and `ARTIFACTS`.
- **Cortex Search:** Hybrid vector + keyword search over `DOSSIERS` and cultural reference docs to match cryptic witness clues against real music/film/art facts.
- **Cortex Agents:** Powers the **INTERPOL MAINFRAME** window by combining Cortex Analyst + Cortex Search in one agent, returning both the narrowed suspect list and a live retro green-text **"SQL & SEARCH TRACE"** so judges watch Snowflake think in real time.
- **Cortex AISQL (`AI_COMPLETE`):** Roleplays witnesses during interrogation, strictly grounded on verified clue rows from Snowflake so witnesses drop fun cultural riddles without contradicting the solution.

### Demo Moment (First 30 Seconds)
1. Judges see a crisp Windows 95 desktop running **CASE #042: THE STOLEN MASTER TAPE** with three retro windows: **Evidence Corkboard** (Polaroids + 6 suspect mugshots), **Witness Chat** (a shady 1995 Soho record-shop clerk), and **INTERPOL MAINFRAME**.
2. The clerk drops a cryptic lead: *"She paid in yen, argued with me about a 1988 anime set in Neo-Tokyo, and had a ticket stub for a famous Dutch museum."*
3. We type that lead into the Interpol Mainframe -> a green-text Snowflake Cortex Agent trace flashes real generated SQL + Cortex Search dossier hits, automatically crossing off 4 of 6 suspects on the corkboard -> we pick the culprit and slam the giant animated **"WARRANT ISSUED"** stamp!

### 5-Hour Build Plan (2 People + Agents)
- **Frontend (`frontend/` — Argon + Neon, Hours 0–3.5):** React Win95 desktop (`98.css` / custom Tailwind bevels) with 3 crisp windows (Suspect Corkboard with auto-cross-off badges, Witness Interrogation chat, Interpol Mainframe terminal with collapsible live Snowflake SQL/Search trace), plus animated Warrant Stamp and a **"60-Sec Demo Case"** fast-start button.
- **Backend (`backend/` — Codex + Claude Agent, Hours 0–3):** FastAPI game engine with deterministic SQL-backed case generation (selects 1 culprit + 1 stolen artifact + 3 ground-truth clue rows from Snowflake so every case is 100% logically solvable), `/api/interrogate` (`AI_COMPLETE` constrained to current witness facts), `/api/mainframe` (Cortex Agent returning matching suspect IDs + SQL trace), and `/api/warrant`.
- **Data & Snowflake (`ai/` + Snowsight — Asim + Codex, Hours 0–2.5):** Create and seed `SUSPECTS` (20), `CITIES` (30), `ARTIFACTS` (50), and `DOSSIERS` (100), build the Semantic View for Cortex Analyst with clear synonyms, create the Cortex Search service over `DOSSIERS`, and configure + test the Cortex Agent with 3 polished demo cases. Freeze by 15:30.
- **What could break (and mitigations):**
  - *AI witnesses contradicting the puzzle or spoiling the culprit:* Never let the LLM invent game state—pick culprit and 3 clue facts deterministically from Snowflake rows and limit `AI_COMPLETE` strictly to in-character dialogue.
  - *Cortex Analyst misfiring on quirky detective phrasing:* Keep the schema flat and clean (3 main tables + rich Semantic View descriptions and verified sample queries).
  - *Mystery taking too long during a 2-minute judge pitch:* Ship a 1-click **"Demo Case"** starting mid-investigation so judges see Clue -> Snowflake Mainframe Trace -> Warrant Stamp in ~45 seconds.

### Honest Scores
- **Wow factor:** 8.5 / 10 (charming Win95 nostalgia + visible live Snowflake Cortex SQL/Search traces solving a real cultural mystery hits both main-track and Snowflake judges hard).
- **Feasibility:** 8 / 10 (Win95 styling is fast with `98.css`, and deterministic SQL-backed clues eliminate the hardest failure mode of AI games).

---

## Quick Comparison

| Idea | Track | Standout Snowflake Flex | Wow | Feasibility |
|---|---|---|---|---|
| **Ceefax 2026** | Retro Remix | Cortex Agent ("Dial-a-Page") + Search + Analyst + `AI_COMPLETE` | 8.5 | **9.0** |
| **Culture Collider** | Creative Tech | Multimodal `AI_COMPLETE` (judge photo in stage) + Cortex Search | **9.5** | 7.5 |
| **Interpol '95** | Retro Remix | Cortex Agent with visible live Analyst SQL + Search trace | 8.5 | 8.0 |
