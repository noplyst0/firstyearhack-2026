# Codex ideas

## 1. The Foley Cupboard

Score a silent film with sounds stolen from a student kitchen. Can a biscuit tin play a haunted lift?

- **Track.** Creative Tech / Code Meets Culture. Foley artists make a scene believable with unlikely props. Here the audience gets to play the artist, then see exactly what fooled their ears.
- **Snowflake.** Record 12 household sounds and annotate each with what it actually sounds like. Cortex Search retrieves clips for cues such as “a metal door shudders shut.” Pass the top hits and the judge’s genre choice to `AI_COMPLETE`, which casts one clip per cue. The backend accepts only IDs in the shortlist. Playback uses the actual recordings.
- **First 30 seconds.** Show six silent seconds of someone pressing a lift button and backing away. A judge taps *Horror*. The button clicks, the cable creaks, the doors slam. Tap *Reveal the props* and replay with a split screen showing a pen, a pepper grinder and a biscuit tin landing on its lid.
- **Five-hour build in JetBrains Air.** In hour 1 both students film one scene and record props while agents scaffold the player and data loader. In hours 2–3 one student owns frontend cue timing and the reveal, the other owns Snowflake retrieval and the score endpoint. In hour 4 integrate two genres and freeze the link by 15:30. Use hour 5 for rehearsal and submission. Browser playback can drift, so trigger all three sounds from one audio clock. Cache one verified Snowflake score per genre for slow queries.
- **Wow 9/10 · Feasibility 8/10.** The reveal earns a second listen. Recording clean, distinct sounds in a noisy venue is the biggest gamble.

## 2. Ceefax After Dark

Give a three-digit teletext set a university night desk. Page 404 is where missing things go.

- **Track.** Retro Remix / Old Tech, New Tricks. Number entry, block mosaics and rotating subpages recreate the ritual of waiting for your page. A flatmate can now supply the next local headline from their phone.
- **Snowflake.** Seed a table with 18 team-written campus notices. For each new notice, Cortex `AI_COMPLETE` selects a desk and compresses the text into a headline and short lines. Keep dates, times and locations as separate input fields and render them verbatim. SQL groups approved notices by desk and orders their subpages.
- **First 30 seconds.** A judge keys 4-0-4 on the projected set and reads “ONE LEFT FLIPPER FOUND.” On a phone, submit “I left a papier-mâché moon in rehearsal room B.” The presenter approves it and page 404 rotates to a lost moon, complete with a crescent in block graphics.
- **Five-hour build in JetBrains Air.** Hour 1 sets three page numbers, line limits and seed notices. In hours 2–3 one student and a frontend agent build the keypad, phone form and three mosaic icons. The other student and a data agent wire submission, Cortex formatting and approval to a polling endpoint. Hour 4 tests the phone-to-screen loop and freezes the URL by 15:30. Hour 5 is for pitch and rehearsal. If the phone loses Wi-Fi, submit from a second tab. Wrap long headlines before rendering to preserve the fixed grid.
- **Wow 8/10 · Feasibility 9/10.** The first new headline makes the old set feel alive. The three-page limit keeps the newsroom small enough to finish.

## 3. The Understudy

Perform one half of a two-person scene while the lines you choose turn the same argument into a breakup or a reconciliation.

- **Track.** Creative Tech / Code Meets Culture. The player tries an actor’s rehearsal exercise, giving an ordinary line a hidden intention. The scene partner’s response lets an audience hear how much meaning lives between the lines.
- **Snowflake.** Write 24 original response lines for a dispute over who gets to keep a flat’s kettle. Each has a recorded take, speaker, scene beat and playable intention. Cortex Search finds candidate replies from their text and intention notes, filtered to the current beat and speaker. Cortex `AI_COMPLETE` picks an eligible take using the last exchange and the judge’s stage direction. The actor’s recorded delivery carries the choice.
- **First 30 seconds.** A judge reads “You can keep the kettle,” chooses *trying to make them stay* and hears their scene partner quietly answer “Then what am I supposed to make you tea in?” Rewind, choose *trying to get them out*, and hear a suitcase zip before “I’ve packed the mugs already.”
- **Five-hour build in JetBrains Air.** Hour 1 writes and records three beats with both actors. During hours 2–3 one student owns the script display, stage-direction buttons, playback and rewind. The other owns the annotated takes, Snowflake selection and API, with agents building fixtures and checking eligible IDs. In hour 4 test both readings with a fresh listener and freeze the demo by 15:30. Hour 5 covers rehearsal and submission. If two replies sound interchangeable, re-record the opening beat first and cache its validated selections.
- **Wow 8/10 · Feasibility 7/10.** A well-delivered pause could sell the whole scene. Writing and performing two genuinely different readings is harder than building the player.
