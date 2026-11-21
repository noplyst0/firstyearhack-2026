# Argon — Hackathon Ideas (FirstYearHack 2026)

---

## Idea 1: Ceefax 2026 (Page 888: The Live London Culture & Tube Teletext)

- **Name + one-line pitch:** **Ceefax 2026** — The iconic 1980s BBC 40×25 blocky Teletext TV browser, resurrected as a live AI-powered cultural radar for London students where you navigate via 3-digit page numbers (`101` News, `302` Gig Radar, `404` Tube Roast, `888` Ask Oracle) or Fastext colour keys.
- **Track it targets and why it scores on that track's criteria:**
  - **Primary Track:** **Track 2: Retro Remix / Old Tech, New Tricks** (with strong crossover appeal to Track 1: Code Meets Culture).
  - **Why it scores:**
    - *Faithful:* Pixel-accurate SAA5050 Teletext font, strict 7-colour ANSI palette (cyan, yellow, magenta, green, red, blue, white on black), block-mosaic graphics (`2×3` sixel characters), rolling sub-pages (`1/3`, `2/3`), live header clock, and working Red/Green/Yellow/Blue Fastext shortcut buttons.
    - *Reinventive & Surprising:* In the 80s, Ceefax was static broadcast pages updated by typists. In Ceefax 2026, typing a 3-digit page number or pressing the Blue "ANALYSE" Fastext button triggers a live Snowflake Cortex query that distils thousands of real-time London cultural events, student society listings, and TfL/weather feeds into razor-sharp 38-character-per-line Teletext bulletins and ASCII/mosaic data visualisations.
- **How Snowflake is used (specific features):**
  - **Snowflake Marketplace + Staging Tables:** Ingest a London events / UK weather / public transit dataset from Snowflake Marketplace alongside scraped KCL / London cultural event listings and reviews in Snowflake tables.
  - **Cortex AI SQL Functions (`AI_COMPLETE`, `SNOWFLAKE.CORTEX.SUMMARIZE`, `SNOWFLAKE.CORTEX.SENTIMENT`):** A scheduled/on-demand SQL pipeline runs `AI_COMPLETE` directly over raw event and news rows with a strict system prompt that formats outputs into authentic 40-column uppercase/mixed-case Teletext lines with colour control codes and `SENTIMENT` scores (turning sentiment into Green/Yellow/Red Teletext status blocks).
  - **Cortex Search + Cortex Analyst (via Cortex Agents):** Page `888` ("Teletext Oracle") lets judges type a natural-language query into the TV scanline prompt (e.g., *"Cheapest live jazz or indie gig near Strand tonight under £10"*). Cortex Search retrieves matching unstructured event listings while Cortex Analyst queries structured pricing/distance tables, returning a freshly rendered Teletext page on the spot.
- **Demo moment: what judges see in the first 30 seconds:**
  - The screen boots with a CRT degauss *thump* sound and scanline flicker onto **Page `100` (KCL-FAX INDEX)** with a block-mosaic Big Ben graphic ticking live seconds. A judge picks up a numeric keypad (or clicks the on-screen 80s TV remote) and punches `3-0-2`: the top header rapidly cycles `P101.. P184.. P249.. P302` like a real decoder waiting for the vertical blanking interval, then snaps onto a live-generated London underground gig guide powered by Snowflake Cortex. The judge hits the **Yellow Fastext button ("VIBE CHECK")**, and Page `888` renders a custom Teletext itinerary for their exact evening in under 2 seconds.
- **Build plan for 5 hours with 2 people + agents:**
  - **Frontend (`frontend/`):** React + Tailwind + HTML5 Canvas/CSS CRT shader (`SAA5050` webfont, 40×25 character grid renderer, TV remote UI + keyboard numpad listener, authentic page-carousel rolling engine, Web Audio API bleeps). Pre-cache 5 core pages so the UI never blanks even if Wi-Fi drops.
  - **Backend (`backend/`):** FastAPI service exposing `/api/page/{page_num}` and `/api/oracle` (POST query -> returns 25 rows of 40-char Teletext markup + Fastext links).
  - **Data / AI (`ai/` & Snowflake):** Load ~500 London cultural events, gig listings, and TfL line statuses into Snowflake. Create a Cortex Search service over event descriptions and a SQL view using `SNOWFLAKE.CORTEX.COMPLETE('llama3.1-70b', ...)` to compile any row batch into 40-column Teletext frames.
  - **What could break & mitigation:**
    - *Risk:* LLM output exceeds 40 chars per line and breaks the Teletext grid. *Mitigation:* Enforce deterministic hard-wrapping and padding to 40 columns in Python before sending to the frontend, using LLM only for headline/bullet text and predefined mosaic templates for borders/headers.
    - *Risk:* Snowflake cold-warehouse spin-up latency during live demo. *Mitigation:* Set warehouse auto-suspend to 30 mins before judging and cache compiled pages `100`–`500` in Snowflake table + backend memory while keeping Page `888` live.
- **Scores (honest):**
  - **Wow factor:** **9 / 10** — Instant visual nostalgia and delight; looks completely unlike every standard dark-mode SaaS dashboard at a hackathon.
  - **Feasibility:** **9 / 10** — Because the UI is constrained to a strict 40×25 character grid, layout bugs are impossible and we can polish the CRT feel to perfection in 3 hours.

---

## Idea 2: Pirate FM 108.9 (The Live AI Pirate Radio & Cultural Remix Deck)

- **Name + one-line pitch:** **Pirate FM 108.9** — A gritty 1990s London rooftop pirate radio boombox & tuning dial in your browser where tuning across frequencies blends real-time cultural trends, subculture archives, and crowd requests into live AI-voiced DJ shoutouts, vinyl scratches, and generative beat mixes.
- **Track it targets and why it scores on that track's criteria:**
  - **Primary Track:** **Track 1: Creative Tech / Code Meets Culture** (also hits Track 2 retro gadget vibes).
  - **Why it scores:**
    - *Connecting with culture:* Pirate radio (Rinse, Kool FM, rooftop rigs) is the DNA of London music and youth culture. Turning cultural data and audience shoutouts into a living, breathing London pirate station connects directly with the city around KCL.
    - *Creative/wacky & cool experience:* Instead of clicking menus, users physically drag an analogue FM tuning dial through static hiss until it locks onto stations (`87.9 GRIME ARCHIVE`, `94.2 STRAND LATE NIGHT`, `104.5 KCL CONFESSIONS FM`, `108.9 YOUR REMIX`), with a dual-cassette recorder that exports a shareable cassette tape mix.
- **How Snowflake is used (specific features):**
  - **Cortex Search over London Music & Subculture Corpus:** Index a curated Snowflake table of UK music history, gig flyers, track metadata (BPM, key, era, borough, subgenre), and live cultural chatter.
  - **Cortex Analyst (Semantic Model over Music/Trend Tables):** Allows the DJ engine (and judges) to query cultural shifts in plain English (e.g., *"Compare average BPM and top lyrical themes between 1998 East London garage and 2026 underground club nights"*) and feeds those hard facts directly into the AI DJ's on-air banter.
  - **Cortex AI Functions (`AI_COMPLETE`, `AI_CLASSIFY`):** Classifies incoming live "listener text-ins" (submitted by judges via a retro Nokia 3310 SMS widget on screen) for mood/genre via `AI_CLASSIFY`, matches them against the Snowflake track/stem table, and uses `AI_COMPLETE` to write a hyped 15-second London pirate MC shoutout script right before the beat drops.
- **Demo moment: what judges see in the first 30 seconds:**
  - Judges see a glowing brushed-metal 90s boombox with bouncing VU meters and hear authentic FM radio static as the presenter drags the red tuning needle from `92.0 MHz` to `98.4 MHz`. The signal locks in with a bass drop. A judge types a text shoutout into the on-screen Nokia 3310 (*"Big up the FirstYearHack judges in Bush House, play something dark and 140 BPM"*). Within 4 seconds, Snowflake Cortex classifies the vibe, picks the matching stems, and the on-air AI DJ shouts out *"Hold tight the Bush House massive locking in on 98.4, Snowflake Cortex just pulled a 140 BPM South London roller for the judging panel—wheel it up!"* over the beat.
- **Build plan for 5 hours with 2 people + agents:**
  - **Frontend (`frontend/`):** Interactive boombox UI with draggable FM frequency tuner, Web Audio API synthesizer + stem looper (white-noise static generator crossfaded by distance from station frequency, real-time FFT spectrum analyser, turntable scratch/rewind button), plus a Nokia 3310 "Studio Request Line" modal.
  - **Backend (`backend/`):** FastAPI server connecting Snowflake Cortex to a fast TTS endpoint (ElevenLabs / Web Speech / OpenAI TTS fallback) + audio stem selector.
  - **Data / AI (`ai/` & Snowflake):** Snowflake database containing 1,000+ UK music/culture records, borough tags, and audio stem mappings; Cortex Search service for subculture lore + SQL stored query using `AI_CLASSIFY` and `AI_COMPLETE` to generate station playlists and MC scripts in one round-trip.
  - **What could break & mitigation:**
    - *Risk:* Audio latency or TTS API failure during the live pitch. *Mitigation:* Pre-bundle 12 royalty-free drum/bass/synth loops locally in the repo so music playback and FM static tuning are 100% client-side zero-latency; have Web Speech API + 3 pre-generated voice clips as instant fallback if network TTS lags.
- **Scores (honest):**
  - **Wow factor:** **9.5 / 10** — Audio + tactile frequency tuning + live shoutouts mentioning the judges by name in the first 20 seconds is electric in a lecture theatre.
  - **Feasibility:** **7.5 / 10** — Synchronising Web Audio loops, radio static crossfading, TTS voice ducking, and Snowflake queries in 5 hours requires tight coordination between frontend audio and backend API.

---

## Idea 3: Dial-Up Time Machine (`NetScape '99`: Browse 2026 Like It's 1999)

- **Name + one-line pitch:** **NetScape '99** — A chaotic Windows 98 / GeoCities web browser and dial-up proxy that takes any 2026 cultural topic, live news story, or Spotify/Letterboxd taste profile and transmutes it in real time into a 1999 Cyber-Caf&eacute; Internet of blinking GIFs, MIDI soundtracks, guestbooks, and ring-network fan shrines.
- **Track it targets and why it scores on that track's criteria:**
  - **Primary Track:** **Track 2: Retro Remix / Old Tech, New Tricks** (with heavy **Track 1: Creative Tech / Code Meets Culture** remixing).
  - **Why it scores:**
    - *Reinventive, surprising + faithful:* Recreates the wild, handmade soul of the late-90s web (Netscape Navigator chrome, 56k modem handshake audio, `<marquee>`, `<blink>`, under-construction GIFs, WebRings, hit counters, and Clippy/BonziBuddy-style desktop assistant) while answering a 2026 question: *"What if today's pop culture existed on GeoCities in 1999?"*
- **How Snowflake is used (specific features):**
  - **Cortex AI Functions (`AI_COMPLETE`, `AI_EXTRACT`, `AI_TRANSLATE` / style-transfer in SQL):** When a user requests a 2026 topic or URL (e.g., *"Brat summer"*, *"KCL Computer Science Freshers"*, *"Dune Part Two"*, or an uploaded image of their outfit/desk using Snowflake multimodal `COMPLETE` on staged images), Snowflake runs a single multi-column SQL query using Cortex functions to generate: (1) the 1999 GeoCities HTML/table lore, (2) 5 dramatic 1999 Guestbook entries from rival forum users, (3) 88×31 pixel badge metadata, and (4) a 4-track General MIDI chiptune chord progression.
  - **Cortex Search ("AltaVista '99 Search Engine"):** The homepage of NetScape '99 is an authentic 1999 **AltaVista / Yahoo! Directory** powered under the hood by **Snowflake Cortex Search**. Every page anyone generates during the hackathon is automatically indexed into a Snowflake table with Cortex Search enabled, creating a live, searchable WebRing of judge- and student-created 1999 shrines.
  - **Cortex Analyst ("WebMaster Stats Counter"):** A retro "Site Traffic & Culture Analytics" popup backed by Cortex Analyst where judges can ask plain-English questions across the Snowflake dataset of cultural trends and generated GeoCities neighborhoods.
- **Demo moment: what judges see in the first 30 seconds:**
  - The browser opens to a crisp Windows 98 desktop. We click "Connect via 56k Modem" (short 2-second screech), open **AltaVista '99**, and ask a judge for any 2026 obsession or let them snap a webcam photo of their fit. In 3 seconds, the progressive image loader paints a top-to-bottom scan of a glorious 1999 GeoCities shrine (`http://www.geocities.com/SiliconValley/Pines/2026/judge_shrine.html`) complete with a synthesized Web Audio MIDI remix playing in the background, a live hit counter (`Visitor #000042`), a flame-war Guestbook signed by `"xX_CyberMatrix99_Xx"`, and a working WebRing link that jumps to other pages indexed in Snowflake Cortex Search.
- **Build plan for 5 hours with 2 people + agents:**
  - **Frontend (`frontend/`):** Windows 98 / Netscape Navigator shell (using `98.css` or custom bevelled win98 components), progressive top-down image loading effect, procedural JSON-to-MIDI Web Audio player, AltaVista search homepage, and Guestbook signer.
  - **Backend (`backend/`):** FastAPI backend with `/api/surf` (queries Cortex Search or generates + stores a new 1999 page in Snowflake via `AI_COMPLETE`), `/api/webring` (returns connected pages from Snowflake), and `/api/guestbook` (inserts & classifies guestbook comments in Snowflake).
  - **Data / AI (`ai/` & Snowflake):** Seed Snowflake with 200+ pop-culture/2026 trend items and 50 pre-built GeoCities neighborhood templates (`Area51`, `Tokyo`, `SiliconValley`, `SunsetStrip`) indexed with **Cortex Search** so AltaVista search returns instant rich results from minute one.
  - **What could break & mitigation:**
    - *Risk:* Generating full raw HTML via LLM can be slow (6–10 seconds) or produce broken tags. *Mitigation:* Do **not** ask the LLM to write raw HTML from scratch; have Snowflake `AI_COMPLETE` return a compact structured JSON payload (title, theme neighborhood, 3 paragraphs of 99-speak, 4 guestbook posts, MIDI mood, ASCII art badge) and render it instantly into our battle-tested React GeoCities templates.
- **Scores (honest):**
  - **Wow factor:** **8.5 / 10** — Hilarious, deeply participatory for judges, and showcases Snowflake Cortex Search ("AltaVista '99") in a way the Snowflake judges will genuinely remember.
  - **Feasibility:** **9 / 10** — JSON-driven retro templates + Snowflake Cortex SQL + `98.css` styling can be built to a rock-solid, bug-free standard well before the 15:30 demo freeze.
