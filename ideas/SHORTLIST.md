# Idea shortlist

Judge and lead engineer pass over all five idea files (asim, claude66, codex, argon, neon) at 12:15 on 21 Nov.
15 ideas, 11 once duplicates are merged. Each is scored 1 to 10 on four criteria with equal weight.
The seats' own scores are ignored because every seat marked its own work. No pick here: Faizan chooses.

- **Track fit:** the track's own judging words. Retro: reinventive, surprising and faithful. Creative: wacky, connected to culture and a cool experience.
- **Snowflake fit:** Snowflake does the AI or data work the demo depends on, with named Cortex features, not just storage.
- **30 s wow:** what judges see and hear in the first 30 seconds. Extra credit when a judge takes part.
- **Buildable:** 2 people plus agents. The real window to the 15:30 demo freeze is about 3 hours, not 5, so this weighs as much as wow.

## Top 5

| # | Idea (seats) | Track | Track fit | Snowflake | 30 s wow | Buildable | Total /40 |
|---|---|---|---|---|---|---|---|
| 1 | **Throwaway**: a disposable camera where Snowflake is the photo lab (claude66) | Retro | 9 | 9 | 9 | 7 | **34** |
| 2 | **KCL-FAX**: teletext with a live campus newsroom (asim, codex, argon, neon) | Retro | 8 | 8 | 8 | 9 | **33** |
| 3 | **Dial-Up '99**: your 2026 obsession as a 1999 fan shrine (argon's NetScape '99) | Retro | 8 | 6 | 7 | 8 | **29** |
| 4 | **Ask Albert**: a 1999 butler search engine for KCL (claude66, plus asim's Clippy Returns) | Retro | 6 | 9 | 5 | 9 | **29** |
| 5 | **The Foley Cupboard**: score a silent film with kitchen props (codex) | Creative | 8 | 4 | 8 | 7 | **27** |

1. **Throwaway.** The judges are in the demo and it is plainly faithful and surprising. Image AI over a stage is a rarer Snowflake use than a chatbot. One yes or no test decides whether it lives (below).
2. **KCL-FAX.** The safest build of the lot and the easiest to make faithful. It loses points on surprise: four of five seats thought of it, so other teams may have too.
3. **Dial-Up '99.** Funny, participatory and quick to build from JSON templates. It ties with Albert and wins on track fit and wow, which decide the main prize. Albert's best part can live inside KCL-FAX as page 888 anyway.
4. **Ask Albert.** The most textbook Snowflake story (an Agent over Search and Analyst, with cited sources) and the easiest build. A judge types a real question and the butler answers with the KCL page it came from. On stage it is still a chatbot in costume.
5. **The Foley Cupboard.** The best Creative Tech idea and the best reveal of the round: a judge taps Horror, the lift scene gets its sounds, then the props are revealed. But Snowflake only picks from 12 clips, which a Snowflake judge can call a lookup table. Venue noise also threatens both recording and playback. Four ideas tie on 27 and this is the only one with a realistic path to a demo by 15:30.

All three of the top 3 are Retro Remix. That fell out of the scores: retro ideas are easier to make faithful in a few hours and give Snowflake a clear job.

## 1. Throwaway (claude66)

**Pitch.** Ask the room how many photos are on their phone, then how many they looked at this month. Throwaway brings back the disposable camera: 27 shots, a tiny viewfinder, a wind after every shot, no preview and no delete. You only see the roll when it is finished, and then it goes to the lab. The lab is Snowflake. Every shot lands in a Snowflake stage. AI_COMPLETE with an image model writes a caption, a mood and a blur score for each one. AI_CLASSIFY sorts them into people, food, place and chaos. AI_AGG reads the whole roll, writes the story of the night and picks the print of the night. The roll comes back as a paper envelope of prints, with a lab sticker on the blurry one: POOR EXPOSURE, NOT CHARGED. The photos never leave Snowflake. Before the first slide we hand a judge the phone with five shots left. They shoot the room and the roll develops while we talk.

**Riskiest part.** Image AI on the trial account. Only some models take images and which ones you get depends on the region, so this can fail outright. Even when it works, a 27-shot develop could take a minute. Make it a yes or no in the first 15 minutes: put one JPEG in a stage, caption it with AI_COMPLETE, then time a 12-shot roll in one query. Second risk: a phone camera needs HTTPS (or localhost), so the backend needs an HTTPS address too, deployed or through a tunnel.

**If it breaks, cut in this order.**
1. A roll of 12, not 27. Shoot the first 7 before judging so the judge only takes 5.
2. Drop AI_CLASSIFY. Keep the caption, the blur score and the roll story.
3. Use the laptop webcam on localhost instead of the judge's phone. No tunnel needed.
4. Develop a backup roll in advance and cache its envelope, so a slow develop on stage still shows prints.
5. If the image test fails, switch to KCL-FAX straight away. Don't swap in an outside vision API: the AI work leaves Snowflake and the side prize goes with it.

## 2. KCL-FAX (asim, codex, argon, neon)

**Pitch.** Before smartphones, the UK read the news on teletext: type a three-digit page number, watch the counter tick while you wait and read it in 40 columns of blocky colour. KCL-FAX rebuilds that faithfully (the grid, the seven colours, the mosaic graphics and the four coloured Fastext buttons) and gives it a live campus newsroom. Anyone can send a notice from their phone. Snowflake reads it: AI_CLASSIFY puts it on the right desk (news, events or page 404, where lost things go), AI_COMPLETE rewrites it as a teletext headline and SQL orders the subpages. A human editor approves it and it airs. The weather page uses real data from the Snowflake Marketplace. Page 888 is a Cortex Agent: ask it anything and it searches the notices, queries the tables and builds you a new page. In the demo a judge keys 4-0-4, sends in something they lost and watches it air.

**Riskiest part.** Standing out. Four of our five seats came up with Ceefax on their own, so another team may bring teletext too. A teletext skin over one LLM call won't win the Snowflake prize either. What makes it ours is the live loop (phone to Snowflake to editor to screen in under ten seconds) and page 888. The tech risk is small. Hard-wrap every line to 40 columns in Python instead of trusting the model. Keep the warehouse warm and cache pages before judging. If the phone loses Wi-Fi, submit from a second tab.

**If it breaks, cut in this order.**
1. Page 888. If you still want an ask page, use Cortex Search plus one AI_COMPLETE call instead of the Agent.
2. Marketplace weather, if no free London dataset loads in 10 minutes. Use a seeded table.
3. The phone form. Submit from a second browser tab.

Floor: 5 pages written by one batch AI_COMPLETE over the seed notices, plus one live submission and approval. That is still a whole demo.

## 3. Dial-Up '99 (argon)

**Pitch.** What would 2026 look like if it lived on the 1999 web? Dial-Up '99 opens a Windows 98 style desktop, plays the modem handshake and asks a judge for their current obsession. A few seconds later a fan shrine paints in line by line, the way pages loaded over a modem: a tiled starry background, a MIDI tune, a hit counter at 000042 and a guestbook already full of flame wars. Snowflake writes every shrine. AI_COMPLETE returns the page as structured JSON that drops into our hand-made 1999 templates and AI_CLASSIFY moderates the guestbook. The search engine on the home page is Cortex Search over every shrine the room has made, so a small 1999 web grows during the hackathon and a webring links it together.

**Riskiest part.** The Snowflake story is the thinnest of the three. To a Snowflake judge one AI_COMPLETE per page is just an LLM call, so the Cortex Search engine has to carry the story and be on screen. It has a catch: a search service refreshes on a target lag, so a shrine made a minute ago may not be findable yet. Seed 30 shrines with one batch query before judging and search those on stage. On the build side, the MIDI tune and the 1999 look can eat all the frontend time.

**If it breaks, cut in this order.**
1. The webcam photo input and any Cortex Analyst stats popup.
2. Generated MIDI. Play 3 or 4 tunes we are allowed to use, picked by the shrine's mood.
3. Guestbook moderation. The guestbook posts come from the same AI_COMPLETE call.
4. The desktop. Keep one browser window.

Floor: one shrine template, one live AI_COMPLETE shrine and Cortex Search over the seeded shrines.

## Duplicates merged

| Merged as | From | What each version brings |
|---|---|---|
| KCL-FAX | asim 1 Ceefax 2026, codex 2 Ceefax After Dark, argon 1 Ceefax 2026, neon 1 Ceefax 2026 | codex: the base loop (phone notices, editor approval, page 404 lost and found). argon: hard-wrap in Python, warm warehouse, the KCL-FAX name. neon: the Agent ask page and a quiz on the Fastext buttons (stretch only). asim: AI_CLASSIFY routing to page ranges, pre-generated pages |
| Ask Albert | claude66 2 Ask Albert, asim 3 Clippy Returns | claude66: an original character, cited sources and "I'm afraid I don't know, sir". asim: the deadline nudge, with Cortex Analyst over a deadlines table |

Shared parts that are not duplicates: Throwaway, Culture Collider and NetScape '99 all put a judge's photo through image AI_COMPLETE, so they share Throwaway's risk. Pirate FM, Culture Collider, Commute Composer and NetScape '99 all make music in the browser from AI output, which sounds random unless it is locked to one scale.

## Not shortlisted

| Idea (seat) | Track | Track fit | Snowflake | 30 s wow | Buildable | Total | Why not |
|---|---|---|---|---|---|---|---|
| Culture Collider (neon) | Creative | 8 | 7 | 7 | 5 | 27 | Four builds in one: collider animation, poster templates, a synth engine and a 1,500-row culture corpus |
| Interpol '95 (neon) | Retro | 7 | 9 | 6 | 5 | 27 | The best Snowflake showcase of the games (Analyst writes the SQL on screen), but about 200 seeded rows must stay solvable. Close to Carmen Sandiego too, so it would need its own agency, characters and look |
| Pirate FM 108.9 (argon) | Creative | 9 | 5 | 8 | 5 | 27 | A great London hook, but the music data it queries doesn't exist yet and browser TTS doing MC slang could land as a caricature |
| Group Chat: The Opera (asim) | Creative | 8 | 7 | 6 | 5 | 26 | Only funny with a chat the room knows, and you can't show a real one without consent |
| Commute Composer (claude66) | Creative | 7 | 6 | 6 | 6 | 25 | Tube connection data and making stops sound like music would eat the day |
| The Understudy (codex) | Creative | 7 | 3 | 6 | 6 | 22 | Rests on acting and recording quality, and Snowflake only picks from 24 lines |

## Whatever you pick

- **Time.** The 11:30 idea freeze has passed and the demo freeze is 15:30. Pick in the next 10 minutes.
- **Snowflake first.** If nobody has a trial account yet, that is job one. Within 15 minutes of it going live, run the one call your idea can't live without: image AI_COMPLETE for Throwaway, AI_CLASSIFY plus AI_COMPLETE on a seed notice for KCL-FAX, CREATE CORTEX SEARCH SERVICE for Dial-Up '99 or Albert. Check which models the account's region offers and whether cross-region inference needs switching on. Credentials only go in .env.
- **Names.** Use the format, not the brand: no Ceefax, BBC, Bamboozle, Clippy, Netscape, GeoCities, AltaVista or Tube roundel and map. KCL-FAX, Throwaway, Dial-Up '99 and Albert are our own.
