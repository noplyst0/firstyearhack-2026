// Comments without the AI (Cortex AI_COMPLETE is blocked on the trial): rule-based lines driven by how the
// drawing went (onLine, coverage, guess, rank, memory round, strokes). Kind, no names, no swearing.
const LINES = {
  top: ['Steady hands. Surgeon or wizard?', 'Suspiciously good.', 'Frame it.', 'The sky called. It wants a print.', 'Did you practise at home?'],
  mid: ['Recognisable. Mostly.', 'Close enough for a party.', 'We see the vision.', 'Solid effort, wobbly sky.', 'The shape is in there somewhere.'],
  low: ['Bold reinterpretation.', 'That shape has been through something.', 'Picasso would be proud. Or confused.', 'Abstract, but brave.', 'A shape was attempted.'],
  bottom: ['Were you swatting a fly?', 'The sky is still recovering.', 'Modern art. Very modern.', 'Interpretive dance, captured.', 'At least you had fun.'],
  invalid: ['Did you fall asleep?', 'Your pen never touched the sky.', 'Hold your thumb down to draw next time.'],
  missing: ['Your phone went quiet. Next round!', 'No drawing reached us. The sky waits.'],
  winner: ['Top of the class. The sky salutes you.', 'Gold standard. Literally.', 'Everyone else: take notes.', 'Champion of thin air.'],
  memory: ['Drawn from memory? Are you secretly a CNC machine?', 'Photographic memory, steady hands.', 'The shape vanished. You did not.'],
  memoryLow: ['The shape vanished, and so did the plan.', 'Memory round: memory not found.'],
  wrongGuess: ['You aimed for {shape}. Snowflake swears that is {guess}.', 'Snowflake ran the maths: {guess}, not {shape}.',
    'Ambitious {shape}. Snowflake sees {guess}.', '{shape}? The SQL says {guess}. The SQL is very sure.'],
  partial: ['Laser steady, on the {coverage}% of {shape} you actually drew.', 'Lovely line. Shame about the other half.',
    'Great start. The rest of {shape} is still out there.'],
  wander: ['You covered all of {shape}, plus some bonus sky.', 'Every bit of {shape}, and then some.', 'Full coverage, creative routing.'],
  manyStrokes: ['{strokes} strokes. A thumb with a plan.', '{strokes} separate attempts at greatness.', 'Dot, dot, dash, done.'],
  oneStroke: ['One stroke, no lifting. Confident.', 'Never lifted the thumb. Respect.'],
  last: ['Someone has to make the rest look good.', 'A brave attempt in a tough room.', 'The comeback starts next round.'],
  practice: ['Warm-up done. Now it counts.', 'That was practice. Nobody saw. (Everyone saw.)', 'Arm warmed up nicely.'],
};

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// pick a line nobody else got this round, when possible
function pickFrom(arr, used) {
  const fresh = used ? arr.filter((l) => !used.has(l)) : arr;
  const line = rand(fresh.length ? fresh : arr);
  if (used) used.add(line);
  return line;
}

function fill(line, v) {
  return line.replace(/\{(\w+)\}/g, (_, k) => (v[k] !== undefined && v[k] !== null ? v[k] : ''));
}

function forScore(score, used) {
  if (score >= 75) return pickFrom(LINES.top, used);
  if (score >= 45) return pickFrom(LINES.mid, used);
  if (score >= 15) return pickFrom(LINES.low, used);
  return pickFrom(LINES.bottom, used);
}
const invalid = (used) => pickFrom(LINES.invalid, used);

// a: { valid, missing, score, onLine, coverage, guess: { shapeId, label }, rank, nStrokes }
// ctx: { shapeId, shapeLabel, memory, practice, n (ranked players), used (Set) }
function forAttempt(a, ctx = {}) {
  const used = ctx.used;
  if (!a.valid) return pickFrom(a.missing ? LINES.missing : LINES.invalid, used);
  const v = {
    shape: ctx.shapeLabel || 'the shape', guess: a.guess && a.guess.label, strokes: a.nStrokes,
    coverage: Math.round(a.coverage || 0), onLine: Math.round(a.onLine || 0),
  };
  const score = a.score || 0, n = ctx.n || 0;
  const wrong = a.guess && ctx.shapeId != null && a.guess.shapeId !== ctx.shapeId;
  const say = (list) => fill(pickFrom(list, used), v);

  if (ctx.practice && Math.random() < 0.5) return say(LINES.practice);
  if (a.rank === 1 && n > 1 && score >= 60) return say(LINES.winner);
  if (ctx.memory && score >= 60) return say(LINES.memory);
  if (ctx.memory && score < 30) return say(LINES.memoryLow);
  if (wrong) return say(LINES.wrongGuess);
  if (a.coverage < a.onLine - 20) return say(LINES.partial);
  if (a.onLine < a.coverage - 20) return say(LINES.wander);
  if (a.nStrokes >= 6) return say(LINES.manyStrokes);
  if (a.rank && n >= 3 && a.rank === n) return say(LINES.last);
  if (a.nStrokes === 1 && score >= 60 && Math.random() < 0.4) return say(LINES.oneStroke);
  return forScore(score, used);
}

module.exports = { forScore, invalid, forAttempt, LINES, fill };
