// Kind fallback lines when the AI is slow, off or blocked.
const LINES = {
  top: ['Steady hands. Surgeon or wizard?', 'Suspiciously good.', 'Frame it.', 'The sky called. It wants a print.', 'Did you practise at home?'],
  mid: ['Recognisable. Mostly.', 'Close enough for a party.', 'We see the vision.', 'Solid effort, wobbly sky.', 'The shape is in there somewhere.'],
  low: ['Bold reinterpretation.', 'That shape has been through something.', 'Picasso would be proud. Or confused.', 'Abstract, but brave.', 'A shape was attempted.'],
  bottom: ['Were you swatting a fly?', 'The sky is still recovering.', 'Modern art. Very modern.', 'Interpretive dance, captured.', 'At least you had fun.'],
  invalid: ['Did you fall asleep?', 'Your pen never touched the sky.', 'Hold your thumb down to draw next time.'],
};
const pickFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

function forScore(score) {
  if (score >= 75) return pickFrom(LINES.top);
  if (score >= 45) return pickFrom(LINES.mid);
  if (score >= 15) return pickFrom(LINES.low);
  return pickFrom(LINES.bottom);
}
const invalid = () => pickFrom(LINES.invalid);

module.exports = { forScore, invalid, LINES };
