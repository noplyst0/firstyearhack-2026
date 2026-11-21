// Change these together with the Snowflake CONFIG table (SHARED §5).
module.exports = {
  N: 64,
  D_MAX: Number(process.env.D_MAX) || 0.35,
  FOV: 60, // V3: bigger arm movements, less wrist twitch (same in Snowflake CONFIG)
  SMOOTHING: 0.35,
  SAMPLE_MS: 33,

  MIN_RAW_POINTS: 8,
  MAX_POINTS: 2000,
  MAX_STROKES: 20,
  MAX_PLAYERS: 150,
  MAX_GHOSTS: 50,
  ROUND_POINTS: [300, 200, 100],
  OTHER_POINTS: 50,

  TIMING: {
    countdownMs: 3000,
    graceMs: 2000, // after the drawing time, before judging
    // auto-advance from results: 8 s + 3.5 s per real player, capped at 90 s (host:next skips it)
    resultsBaseMs: 8000,
    resultsPerPlayerMs: 3500,
    resultsMaxMs: 90000,
    extrasDelayMs: 400, // local mode: extras a moment after results
    hostGraceMs: 60000, // room kept after the host leaves
    lobbyGraceMs: 20000, // disconnected lobby player kept for a refresh
    idleMs: 60 * 60 * 1000,
    durationScale: 1, // tests shrink round times
  },

  SF_MS: { score: 4000, comments: 3000, percentiles: 1500, roomView: 3000, extras: 3500, ghosts: 2000, stats: 2000, ping: 45000 },
  PERCENTILE_MIN_POOL: 20,
};
