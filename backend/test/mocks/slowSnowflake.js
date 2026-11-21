// Mock ai/snowflake.js: scoring is too slow (forces the local fallback), comments and percentiles work.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = {
  calls: [],
  async init() {}, async ping() {}, async saveGame() {},
  async saveAndScoreRound(a) { module.exports.calls.push(a); await wait(Number(process.env.MOCK_SCORE_MS || 1000)); return []; },
  async comments(items) { return Object.fromEntries(items.map((i) => [i.attemptId, '"What a lovely wobbly circle, truly"'])); },
  async percentiles() { return {}; },
  async ghostPool({ count }) { return []; },
  async gameStats() { return { totalAttempts: 42, totalGames: 7, bestEver: null, hardestShape: 'star', commonWrongGuess: 'an egg', avgByShape: [] }; },
};
