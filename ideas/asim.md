# Ideas: asim (Asim's Claude)

Team: 2 people + agents, ~5h build, demo frozen 15:30. Scores are honest, not hype.
Snowflake function names come from docs/snowflake.md and the Snowflake AISQL docs; verify exact names/availability in our trial account before committing.

---

## 1. Ceefax 2026
**Pitch:** Rebuild BBC Ceefax teletext in the browser, but every page (news, sport, weather, "what's on at KCL") is written live by Snowflake AI from real data, in a strict 40x24 mosaic grid with page numbers and coloured Fastext buttons.

**Track:** Retro Remix / Old Tech, New Tricks.
- Faithful: true 40x24 character grid, 7 teletext colours, blocky mosaic graphics, 3-digit page navigation (type 101), Fastext red/green/yellow/cyan buttons, the slow row-by-row paint.
- Reinventive: pages are generated, not authored; there is a page 888 for subtitles of whatever is on screen and a page where you ask a question in 40 characters per line.
- Surprising: a 1970s format doing live AI summaries.

**Snowflake use (real work, not storage):**
- Load a real dataset into a table (a free Marketplace dataset such as weather, or a public news/sport feed we ingest; pick whichever is quickest to query).
- `AI_COMPLETE` run from SQL over the rows to write each page, with the prompt forcing 40-char lines and a fixed page layout; `AI_CLASSIFY` to route stories to page ranges (100 news, 200 sport, 300 weather).
- Cortex Search over the generated pages so page "index search" finds stories by meaning.
- Optional: Cortex Analyst for a "ask the numbers" page (plain English -> SQL).

**Demo moment (first 30s):** Judges see a CRT-style screen boot to page 100, text painting in row by row with a chunky logo. Presenter types 3 digits on a real keyboard, page changes, and the headline is today's real data. Then types "KCL" into search.

**Build plan (5h, 2 people + agents):**
- Frontend (Faizan's frontend seat): static canvas/DOM 40x24 renderer, CRT CSS (scanlines, glow), keyboard + Fastext nav, page-paint animation. ~2h.
- Backend: small API `GET /page/:n` returning 24 rows x 40 chars + colour codes; pulls pre-generated pages from Snowflake and caches them. ~1h.
- Data/AI (my ai/ folder): SQL + prompts that generate and validate pages, then batch-generate ~30 pages ahead of time so the demo is not waiting on an LLM. ~1.5h.
- What could break: LLM ignoring the 40-char width (mitigate: validate and re-run, hard-wrap in code); dataset choice eats an hour; live generation latency (mitigate: pre-generate, only the search/Q&A page is live).

**Wow 7 / Feasibility 8.**

---

## 2. Group Chat: The Opera
**Pitch:** Paste in a flat/uni group chat and Snowflake AI turns it into a staged opera: a cast of characters, a libretto, running gags brought back in Act 3, performed on screen with different voices.

**Track:** Creative Tech / Code Meets Culture.
- Creative/wacky: your friends' chat as a dramatic opera, with a villain (whoever never replies) and a chorus (the "lol"s).
- Connects with culture: flat banter, in-jokes and freshers' life are the material.
- Cool experience: it is performed (scrolling libretto, character portraits, browser text-to-speech voices), not just a text dump.

**Snowflake use:**
- Chat messages loaded into a table (one row per message).
- `AI_SENTIMENT` and `AI_CLASSIFY` per message to tag mood and role (hero / villain / chorus / comic relief), then aggregate per person in SQL to build the cast.
- `AI_COMPLETE` over the grouped data to write the libretto, per act.
- Cortex Search over the messages so Act 3 can retrieve the "callback" (the pizza incident from week 1) and quote it.
- Data stays in Snowflake: good privacy line, since group chats are personal.

**Demo moment (first 30s):** Opening title card "A Tragedy in Three Acts" with a cast poster generated from a real (consented or synthetic) chat; first aria starts with a voice reading a line the room recognises.

**Build plan:**
- Frontend: stage view (cast cards, scrolling libretto, speech synthesis per character, act transitions). ~2h.
- Backend: upload endpoint (parse WhatsApp export format), job that kicks off the Snowflake pipeline, `GET /opera/:id`. ~1.5h.
- Data/AI (ai/): per-message tagging, cast aggregation, libretto prompts with structured JSON output (speaker, line, act). ~1.5h.
- What could break: WhatsApp export parsing edge cases (mitigate: fix one format, ship a synthetic sample chat for the demo); privacy (never demo a real chat without consent, use synthetic); libretto coherence over long chats (mitigate: summarise per week then compose); browser TTS voice quality varies.

**Wow 8 / Feasibility 6.** Highest ceiling of the three but the most moving parts.

---

## 3. Clippy Returns
**Pitch:** Bring back Microsoft's Office Assistant ("It looks like you're writing a lab report...") as a real Cortex Agent that knows your lecture notes and your deadlines, with all the original pop-up, eyebrow and "Need help?" behaviour.

**Track:** Retro Remix / Old Tech, New Tricks.
- Faithful: pixel-style paperclip that follows the cursor, speech bubble with the "It looks like you're..." template, the idle animations and the "Don't show me this tip again" checkbox.
- Reinventive: the 90s assistant that was famously unhelpful is now actually helpful.
- Surprising: the joke lands first, then it answers a real question correctly with citations.

**Snowflake use (strongest "best use" story of the three):**
- Cortex Search over uploaded lecture PDFs/notes (docs chunked into a table).
- Cortex Analyst with a semantic view over a small deadlines/marks table ("what is due this week and what is it worth?").
- Cortex Agents combining both: one agent that picks Search for "explain X" and Analyst for "what's due". Agent responses cite the source.
- Optional: Streamlit in Snowflake as a fallback UI if the custom frontend slips.

**Demo moment (first 30s):** Clippy appears bottom-right, bounces, and says "It looks like you have a coursework deadline in 2 days." Presenter asks "what is the difference between a stack and a queue?" and Clippy answers from the real lecture notes with a citation, then the same agent answers "what's due Friday?" from the table.

**Build plan:**
- Frontend: Clippy sprite/animations, chat bubble, citation chips, a page behind it that looks like a retro word processor. ~2h.
- Backend: `/ask` proxying to the Snowflake Agent endpoint (REST), streaming response. ~1.5h.
- Data/AI (ai/): ingest + chunk notes, create the Search service and semantic view, configure and test the Agent; prepare 10 known-good demo questions. ~1.5h.
- What could break: Agent setup and account-level permissions taking longer than expected (mitigate: get a Search-only version working first, add Analyst after); sprite/art assets (use CSS or an emoji-grade drawing; no copying Microsoft artwork, make our own paperclip); cost per token (small data).

**Wow 7 / Feasibility 8.**

---

## My pick
Feasibility-adjusted: **Clippy Returns** (cleanest Snowflake story, low risk) or **Ceefax 2026** (best visual identity). Opera has the highest ceiling if we are confident on the pipeline by 13:00; otherwise skip it.
