// Game loop: LOBBY -> ROUND_ACTIVE -> JUDGING -> RESULTS -> ... -> GAME_END (SHARED §3, §4; plan/backend.md §2-7)
const crypto = require('crypto');
const C = require('./constants');
const S = require('./scoreLocal');
const shapes = require('./shapes');
const names = require('./names');
const canned = require('./canned');
const ghosts = require('./ghosts');
const store = require('./store');
const sf = require('./sf');

const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels, so no rude words on the big screen

// how long RESULTS stays up before the next round: the host reveals every real player one by one
function resultsDelayMs(nReal, T = C.TIMING) {
  return Math.min(T.resultsMaxMs, T.resultsBaseMs + T.resultsPerPlayerMs * Math.max(0, nReal));
}

function createGame(io, opts = {}) {
  const T = { ...C.TIMING, ...(opts.timing || {}) };
  const SF = { ...C.SF_MS, ...(opts.sfMs || {}) };
  const library = opts.library || shapes.library;
  const byId = (id) => library.find((s) => s.id === id) || null;
  const rooms = new Map();
  const stats = { lastScorer: null };
  const log = opts.quiet ? () => {} : (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

  // ---------- helpers ----------
  function newCode() {
    for (let i = 0; i < 5000; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      if (!rooms.has(c)) return c;
    }
    throw new Error('no free room codes');
  }
  const getRoom = (code) => (typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) || null : null);
  const realPlayers = (room) => [...room.players.values()].filter((p) => !p.isBot);
  const ghostList = (room) => [...room.players.values()].filter((p) => p.isBot);
  const connectedReal = (room) => realPlayers(room).filter((p) => p.connected);
  const sockOf = (id) => (id ? io.sockets.sockets.get(id) : null);
  const hostConnected = (room) => !!sockOf(room.hostSocketId);

  function setTimer(room, name, ms, fn) {
    clearTimer(room, name);
    room.timers[name] = setTimeout(() => {
      delete room.timers[name];
      Promise.resolve().then(fn).catch((e) => log(`[${room.code}] ${name} error:`, e.stack || e.message));
    }, ms);
  }
  function clearTimer(room, name) {
    if (room.timers[name]) { clearTimeout(room.timers[name]); delete room.timers[name]; }
  }
  const clearAll = (room) => Object.keys(room.timers).forEach((n) => clearTimer(room, n));

  // remember = this is the room's current phase, resent to a phone or host that reconnects
  function emit(room, event, payload, remember = true) {
    io.to(room.code).emit(event, payload);
    if (remember) room.last = { event, payload };
  }

  const lobbyPayload = (room) => ({
    players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
  });
  function emitLobby(room) {
    const payload = lobbyPayload(room);
    io.to(room.code).emit('lobby:update', payload);
    if (room.state === 'LOBBY') room.last = { event: 'lobby:update', payload };
  }

  function newGameId(isTest) {
    const id = (isTest ? 'TEST-' : '') + crypto.randomUUID();
    return id;
  }
  function saveGame(room) {
    if (!sf.enabled) return;
    sf.call('saveGame', { gameId: room.gameId, code: room.code, isTest: room.isTest }, 10000)
      .catch((e) => log(`[${room.code}] saveGame failed: ${e.message}`));
  }

  // resend the room's current phase to one socket (reconnect / host reclaim)
  function resend(room, socket) {
    socket.emit('lobby:update', lobbyPayload(room));
    const last = room.last;
    if (!last || last.event === 'lobby:update') return;
    let payload = last.payload;
    if (last.event === 'round:start' && room.state === 'ROUND_ACTIVE') {
      const now = Date.now();
      const end = room.goAt + payload.durationMs;
      payload = { ...payload, countdownMs: Math.max(0, room.goAt - now), durationMs: Math.max(0, Math.min(payload.durationMs, end - now)), resumed: true };
    }
    socket.emit(last.event, payload);
    if (last.event === 'round:results' && room.extras) socket.emit('round:extras', room.extras);
  }

  function touch(room) { room.lastActivity = Date.now(); }

  function createRoom(socket, isTest) {
    const code = newCode();
    const room = {
      code, isTest, gameId: newGameId(isTest), hostSocketId: socket.id, state: 'LOBBY',
      players: new Map(), rounds: 3, round: 0, plan: [], subs: new Map(), timers: {},
      last: null, extras: null, history: [], ghostPromise: null, lastActivity: Date.now(), ghostSeq: 0,
    };
    rooms.set(code, room);
    saveGame(room);
    return room;
  }

  function deleteRoom(room, reason) {
    clearAll(room);
    io.to(room.code).emit('room:closed', { reason });
    rooms.delete(room.code);
    log(`[${room.code}] closed (${reason})`);
  }

  function resetTotals(room) {
    for (const p of room.players.values()) { p.total = 0; p.best = 0; }
    room.history = [];
  }

  // ---------- rounds ----------
  function startRound(room) {
    room.round += 1;
    const step = room.plan[room.round]; // plan[0] = practice round 0
    const shape = byId(step.shapeId) || byId(1);
    const durationMs = Math.round(step.durationMs * T.durationScale);
    room.subs = new Map();
    room.extras = null;
    room.state = 'ROUND_ACTIVE';
    room.goAt = Date.now() + T.countdownMs;
    room.shape = shape;
    room.durationMs = durationMs;
    room.practice = !!step.practice;
    const payload = {
      round: room.round, totalRounds: room.rounds, shapeId: shape.id, shapeName: shape.name,
      difficulty: shape.difficulty, targetStrokes: shape.strokes, targetPoints: shape.strokes.flat(),
      durationMs, countdownMs: T.countdownMs, memory: !room.practice && room.round === room.rounds, practice: room.practice,
      fov: C.FOV, smoothing: C.SMOOTHING,
    };
    emit(room, 'round:start', payload);
    room.ghostPromise = prepareGhosts(room, shape);
    room.ghostPromise.catch(() => {});
    setTimer(room, 'round', T.countdownMs + durationMs + T.graceMs, () => judge(room));
    emitProgress(room);
    log(`[${room.code}] round ${room.round}/${room.rounds} start: ${shape.name}${payload.memory ? ' (memory)' : ''}${room.practice ? ' (practice)' : ''}`);
  }

  async function prepareGhosts(room, shape) {
    const count = ghostList(room).length;
    if (!count) return [];
    let fromSf = [];
    if (sf.enabled) {
      try { fromSf = (await sf.call('ghostPool', { shapeId: shape.id, count }, SF.ghosts)) || []; } catch (_) { fromSf = []; }
    }
    return ghosts.pickDrawings(count, [fromSf, store.ghostPool(shape.id)], shape.norm);
  }

  function emitProgress(room) {
    const real = connectedReal(room);
    io.to(room.code).emit('round:progress', {
      round: room.round, submitted: real.filter((p) => room.subs.has(p.id)).length, total: real.length,
    });
  }

  function checkAllIn(room) {
    if (room.state !== 'ROUND_ACTIVE') return;
    const real = connectedReal(room);
    if (real.length && real.every((p) => room.subs.has(p.id))) {
      clearTimer(room, 'round');
      log(`[${room.code}] round ${room.round}: everyone submitted`);
      setTimer(room, 'round', 50, () => judge(room));
    }
  }

  // clean a submitted drawing: finite [x,y] pairs, at most 20 strokes and 2000 points in total
  function cleanStrokes(data) {
    let strokes = Array.isArray(data.strokes) ? data.strokes : Array.isArray(data.points) ? [data.points] : null;
    if (!strokes) return null;
    const out = [];
    let total = 0;
    for (const s of strokes.slice(0, C.MAX_STROKES)) {
      if (!Array.isArray(s)) continue;
      const pts = [];
      for (const p of s) {
        if (total >= C.MAX_POINTS) break;
        if (Array.isArray(p) && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) { pts.push([+p[0], +p[1]]); total++; }
      }
      if (pts.length) out.push(pts);
    }
    return { strokes: out, nRaw: total, truncated: strokes.length > C.MAX_STROKES || total >= C.MAX_POINTS };
  }

  async function judge(room) {
    if (room.state !== 'ROUND_ACTIVE') return;
    room.state = 'JUDGING';
    clearTimer(room, 'round');
    const { round, gameId, shape, practice } = room;
    const t0 = Date.now();

    const attempts = [];
    for (const p of realPlayers(room)) {
      const sub = room.subs.get(p.id);
      const d = sub ? S.processDrawing(sub.strokes, sub.nRaw) : { valid: false, pathStrokes: null };
      attempts.push({
        attemptId: `${gameId}-${round}-${p.id}`, playerId: p.id, playerName: p.name, isBot: false, valid: d.valid,
        nRaw: sub ? sub.nRaw : 0, nStrokes: sub ? sub.strokes.length : 0,
        durationMs: sub ? Math.max(0, sub.receivedAt - room.goAt) : 0,
        submittedAt: sub ? new Date(sub.receivedAt).toISOString() : null,
        rawStrokes: sub ? sub.strokes : [], pathStrokes: d.pathStrokes, missing: !sub, isPractice: practice,
      });
    }
    let ghostDraws = [];
    try { ghostDraws = await room.ghostPromise; } catch (_) { ghostDraws = []; }
    if (rooms.get(room.code) !== room) return; // room closed meanwhile
    ghostList(room).forEach((g, i) => {
      let draw = ghostDraws[i] || { strokes: ghosts.fakeAttempt(shape.norm), source: 'fake' };
      let d = S.processDrawing(draw.strokes);
      if (!d.valid) { draw = { strokes: ghosts.fakeAttempt(shape.norm), source: 'fake' }; d = S.processDrawing(draw.strokes); }
      attempts.push({
        attemptId: `${gameId}-${round}-${g.id}`, playerId: g.id, playerName: g.name, isBot: true, valid: d.valid,
        nRaw: draw.strokes.flat().length, nStrokes: draw.strokes.length, durationMs: room.durationMs,
        submittedAt: new Date(room.goAt + room.durationMs).toISOString(),
        rawStrokes: draw.strokes, pathStrokes: d.pathStrokes, ghostSource: draw.source, isPractice: practice,
      });
    });

    const validCount = attempts.filter((a) => a.valid).length;
    emit(room, 'round:judging', { round, drawings: validCount, distanceChecks: validCount * S.N * S.TARGET_N * library.length }, false);

    // Snowflake first (4 s race), local maths as the fallback
    let rows = null, scorer = 'local';
    if (sf.enabled && attempts.length) {
      const sfAttempts = attempts.map(({ missing, ghostSource, ...a }) => a);
      try {
        const r = await sf.call('saveAndScoreRound', { gameId, round, shapeId: shape.id, attempts: sfAttempts }, SF.score);
        if (!Array.isArray(r) || r.length < validCount) throw new Error(`snowflake returned ${Array.isArray(r) ? r.length : 'no'} rows for ${validCount} drawings`);
        rows = r;
        scorer = 'snowflake';
      } catch (e) {
        log(`[${room.code}] round ${round}: snowflake scoring failed (${e.message}), using local`);
      }
    }
    if (!rows) rows = S.scoreRoundLocal(attempts, shape.id, library, C.D_MAX);
    if (rooms.get(room.code) !== room || room.state !== 'JUDGING') return;
    const judgeMs = Date.now() - t0;
    stats.lastScorer = scorer;

    // merge scores, then rank here with the shared rule so both scorers rank the same way
    const rowBy = new Map(rows.map((r) => [r.attemptId, r]));
    for (const a of attempts) {
      const r = a.valid ? rowBy.get(a.attemptId) : null;
      if (a.valid && !r) a.valid = false; // Snowflake skipped it: treat as invalid rather than invent a score
      a.accuracy = r ? +r.accuracy : 0;
      a.onLine = r ? +r.onLine : 0;
      a.coverage = r ? +r.coverage : 0;
      a.guess = r && r.guess ? { shapeId: r.guess.shapeId, label: r.guess.label, score: S.round1(+r.guess.score) } : null;
    }
    S.rankAttempts(attempts);
    if (practice) for (const a of attempts) a.roundPoints = 0; // practice: ranks shown, no points

    const ranked = attempts.filter((a) => a.rank).sort((a, b) => a.rank - b.rank);
    const featured = ranked.slice(0, 3);
    if (ranked.length >= 4) featured.push(ranked[ranked.length - 1]);
    const featuredIds = new Set(featured.map((a) => a.playerId));

    const memory = !practice && round === room.rounds;
    const commentCtx = { shapeId: shape.id, shapeLabel: shape.label || shape.name, memory, practice, n: ranked.length, used: new Set() };
    const lineFor = (a) => canned.forAttempt({ ...a, score: a.valid ? S.round1(a.accuracy) : 0 }, commentCtx);
    const results = [];
    const order = [
      ...ranked,
      ...attempts.filter((a) => !a.isBot && !a.rank),
      ...attempts.filter((a) => a.isBot).sort((a, b) => b.accuracy - a.accuracy),
    ];
    for (const a of order) {
      const p = room.players.get(a.playerId);
      if (!p) continue;
      p.total += a.roundPoints;
      const score = a.valid ? S.round1(a.accuracy) : 0;
      if (a.valid && !practice && score > p.best) p.best = score;
      results.push({
        playerId: p.id, name: p.name, isBot: p.isBot, valid: a.valid, score,
        accuracy: S.round1(a.accuracy), onLine: S.round1(a.onLine), coverage: S.round1(a.coverage),
        rank: a.rank, roundPoints: a.roundPoints, totalPoints: p.total, guess: a.guess,
        comment: featuredIds.has(p.id) ? null : lineFor(a),
        pathStrokes: a.pathStrokes || [],
      });
    }
    const top = ranked[0];
    const winner = top ? { playerId: top.playerId, name: room.players.get(top.playerId).name, score: S.round1(top.accuracy) } : null;

    room.state = 'RESULTS';
    emit(room, 'round:results', {
      round, practice, shapeId: shape.id, shapeName: shape.name, targetNorm: shape.norm, targetNormStrokes: S.targetNormStrokes(shape), scorer, judgeMs, winner, results,
    });
    room.history.push({ round, practice, shapeId: shape.id, shapeName: shape.name, results });
    log(`[${room.code}] round ${round} results: scorer ${scorer}, judge ${judgeMs} ms, ${validCount} drawings, winner ${winner ? winner.name + ' ' + winner.score : 'none'}, next in ${resultsDelayMs(realPlayers(room).length, T) / 1000} s`);

    // local percentile pool is read before this round is appended
    const scoresByPlayer = Object.fromEntries(ranked.map((a) => [a.playerId, S.round1(a.accuracy)]));
    const localPct = store.percentiles(shape.id, scoresByPlayer);
    if (!room.isTest && !practice) { // practice attempts never feed ghosts or percentiles
      const at = new Date().toISOString();
      store.append(ranked.map((a) => ({ gameId, round, shapeId: shape.id, pathStrokes: a.pathStrokes, score: S.round1(a.accuracy), at })));
    }

    const advanceMs = resultsDelayMs(realPlayers(room).length, T);
    setTimer(room, 'results', advanceMs, () => next(room));
    sendExtras(room, { round, shape, featured, ranked, attempts, localPct, lineFor }).catch((e) => log(`[${room.code}] extras error:`, e.message));
  }

  async function sendExtras(room, { round, shape, featured, ranked, localPct, lineFor }) {
    const started = Date.now();
    const n = ranked.length;
    const items = featured.map((a) => {
      const notes = a.coverage < a.onLine - 20 ? 'only drew part of the shape' : a.onLine < a.coverage - 20 ? 'wandered off the line' : 'none';
      return {
        attemptId: a.attemptId, playerId: a.playerId,
        prompt: 'You are the funny host of a party game where players trace a shape in the air with their phones without seeing their line. '
          + "Write ONE short comment (maximum 14 words) about this player's attempt. Be playful and kind. No insults about people, no swearing, no names. "
          + `Facts: shape = ${shape.name}; rank = ${a.rank} of ${n}; score = ${Math.round(a.accuracy)}%; stayed on the line = ${Math.round(a.onLine)}%; `
          + `covered the shape = ${Math.round(a.coverage)}%; it looked most like ${a.guess ? a.guess.label : 'nothing in particular'}; notes = ${notes}. Return only the comment.`,
      };
    });

    let aiComments = null, sfPct = null;
    if (sf.enabled) {
      [aiComments, sfPct] = await Promise.all([
        items.length ? sf.call('comments', items.map(({ attemptId, prompt }) => ({ attemptId, prompt })), SF.comments).catch(() => null) : null,
        ranked.length ? sf.call('percentiles', { shapeId: shape.id, gameId: room.gameId, round }, SF.percentiles).catch(() => null) : null,
      ]);
    } else {
      await new Promise((r) => setTimeout(r, T.extrasDelayMs));
    }
    if (rooms.get(room.code) !== room || room.round !== round) return;

    const comments = {};
    let aiCount = 0;
    for (const it of items) {
      const a = featured.find((f) => f.attemptId === it.attemptId);
      const ai = aiComments ? names.cleanComment(aiComments[it.attemptId]) : null;
      if (ai) aiCount++;
      comments[it.playerId] = ai || lineFor(a);
    }
    let percentiles = {};
    if (sfPct) {
      for (const a of ranked) {
        const v = sfPct[a.attemptId];
        if (v && v.pool >= C.PERCENTILE_MIN_POOL) percentiles[a.playerId] = { beatPct: Math.round(+v.beatPct), pool: +v.pool };
      }
    }
    if (!Object.keys(percentiles).length) percentiles = localPct;

    room.extras = { round, comments, percentiles };
    emit(room, 'round:extras', room.extras, false);
    log(`[${room.code}] round ${round} extras: ${aiCount}/${items.length} AI comments, ${Object.keys(percentiles).length} percentiles, ${Date.now() - started} ms`);
  }

  function next(room) {
    if (room.state !== 'RESULTS') return;
    clearTimer(room, 'results');
    if (room.round < room.rounds) startRound(room);
    else endGame(room).catch((e) => log(`[${room.code}] endGame error:`, e.message));
  }

  function localStats(room) {
    const real = room.history.filter((h) => !h.practice); // stats exclude the practice round
    const valid = real.flatMap((h) => h.results.filter((r) => !r.isBot && r.valid).map((r) => ({ ...r, shapeId: h.shapeId, shape: h.shapeName })));
    const avgByShape = real.map((h) => {
      const rs = h.results.filter((r) => !r.isBot && r.valid);
      return { shape: h.shapeName, avg: rs.length ? S.round1(rs.reduce((a, r) => a + r.score, 0) / rs.length) : 0, n: rs.length };
    });
    const best = valid.reduce((b, r) => (!b || r.score > b.score ? r : b), null);
    const withData = avgByShape.filter((s) => s.n);
    const hardest = withData.reduce((h, s) => (!h || s.avg < h.avg ? s : h), null);
    const wrong = {};
    for (const r of valid) if (r.guess && r.guess.shapeId !== r.shapeId) wrong[r.guess.label] = (wrong[r.guess.label] || 0) + 1;
    const common = Object.entries(wrong).sort((a, b) => b[1] - a[1])[0];
    return {
      source: 'local', totalAttempts: valid.length, totalGames: 1,
      bestEver: best ? { name: best.name, score: best.score, shape: best.shape } : null,
      hardestShape: hardest ? hardest.shape : null,
      commonWrongGuess: common ? common[0] : null,
      avgByShape,
    };
  }

  // Snowflake stats win field by field; anything missing, null or not a number falls back to this game's own value.
  // bestEver is always { name, score, shape } (V3), never a bare number.
  function mergeStats(sfStats, local) {
    if (!sfStats || typeof sfStats !== 'object') return local;
    const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const out = { ...local, source: 'snowflake' };
    for (const [k, v] of Object.entries(sfStats)) if (v !== null && v !== undefined) out[k] = v;
    for (const k of ['totalAttempts', 'totalGames']) out[k] = num(sfStats[k]) ?? local[k];
    const be = sfStats.bestEver;
    if (be && typeof be === 'object' && num(be.score) !== null) {
      out.bestEver = { name: be.name ?? null, score: S.round1(num(be.score)), shape: be.shape ?? null };
    } else if (num(be) !== null) {
      // bare number from older SQL: keep the score, borrow name and shape only if this game set it
      const l = local.bestEver;
      out.bestEver = l && Math.abs(l.score - num(be)) < 0.05 ? l : { name: null, score: S.round1(num(be)), shape: null };
    } else {
      out.bestEver = local.bestEver;
    }
    if (Array.isArray(out.avgByShape)) out.avgByShape = out.avgByShape.map((s) => ({ ...s, avg: num(s.avg) === null ? null : S.round1(num(s.avg)), n: num(s.n) ?? 0 }));
    return out;
  }

  async function endGame(room) {
    if (room.state === 'GAME_END') return;
    room.state = 'GAME_END';
    clearAll(room);
    const leaderboard = realPlayers(room)
      .sort((a, b) => b.total - a.total || b.best - a.best)
      .map((p) => ({ playerId: p.id, name: p.name, total: p.total }));
    let sfStats = null;
    if (sf.enabled) {
      try { sfStats = await sf.call('gameStats', {}, SF.stats); } catch (_) { sfStats = null; }
    }
    const st = mergeStats(sfStats, localStats(room));
    if (rooms.get(room.code) !== room || room.state !== 'GAME_END') return;
    emit(room, 'game:end', { leaderboard, stats: st });
    log(`[${room.code}] game end: ${leaderboard.slice(0, 3).map((l) => `${l.name} ${l.total}`).join(', ')} (stats ${st.source})`);
  }

  // ---------- socket events ----------
  function handle(socket, event, fn) {
    socket.on(event, (data, cb) => {
      if (typeof data === 'function') { cb = data; data = {}; }
      const ack = (p) => { if (typeof cb === 'function') cb(p); };
      try {
        fn(data && typeof data === 'object' ? data : {}, ack);
      } catch (e) {
        log(`${event} error:`, e.stack || e.message);
        ack({ ok: false, error: 'SERVER_ERROR' });
      }
    });
  }

  function hostRoom(socket, data, ack) {
    const room = getRoom(data.code);
    if (!room) { ack({ ok: false, error: 'ROOM_NOT_FOUND' }); return null; }
    if (room.hostSocketId !== socket.id) { ack({ ok: false, error: 'NOT_HOST' }); return null; }
    touch(room);
    return room;
  }

  io.on('connection', (socket) => {
    handle(socket, 'host:create', (data, ack) => {
      let room = data.code ? getRoom(data.code) : null;
      if (room && !hostConnected(room)) {
        room.hostSocketId = socket.id;
        clearTimer(room, 'hostGone');
        socket.join(room.code);
        socket.data = { role: 'host', code: room.code };
        touch(room);
        log(`[${room.code}] host reclaimed (${room.state})`);
        ack({ code: room.code, state: room.state });
        resend(room, socket);
        return;
      }
      room = createRoom(socket, !!data.test);
      socket.join(room.code);
      socket.data = { role: 'host', code: room.code };
      log(`[${room.code}] created ${room.isTest ? '(test) ' : ''}game ${room.gameId}`);
      ack({ code: room.code, state: room.state });
      emitLobby(room);
    });

    handle(socket, 'player:join', (data, ack) => {
      const room = getRoom(data.code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      touch(room);
      const known = data.playerId && room.players.get(data.playerId);
      if (known && !known.isBot) {
        const old = sockOf(known.socketId);
        if (old && old.id !== socket.id) { old.data = {}; old.leave(room.code); }
        known.socketId = socket.id;
        known.connected = true;
        clearTimer(room, 'lobbyGone-' + known.id);
        socket.join(room.code);
        socket.data = { role: 'player', code: room.code, playerId: known.id };
        log(`[${room.code}] ${known.name} rejoined (${room.state})`);
        ack({ ok: true, playerId: known.id, name: known.name });
        resend(room, socket);
        if (room.state === 'LOBBY') emitLobby(room);
        else if (room.state === 'ROUND_ACTIVE') emitProgress(room);
        return;
      }
      if (room.state !== 'LOBBY') return ack({ ok: false, error: 'ROOM_STARTED' });
      const n = names.cleanName(data.name);
      if (!n.ok) return ack({ ok: false, error: n.error });
      if (realPlayers(room).length >= C.MAX_PLAYERS) return ack({ ok: false, error: 'ROOM_FULL' });
      const lower = n.name.toLowerCase();
      if ([...room.players.values()].some((p) => p.name.toLowerCase() === lower)) return ack({ ok: false, error: 'NAME_TAKEN' });
      const id = 'p' + crypto.randomBytes(4).toString('hex');
      room.players.set(id, { id, name: n.name, isBot: false, socketId: socket.id, connected: true, total: 0, best: 0 });
      socket.join(room.code);
      socket.data = { role: 'player', code: room.code, playerId: id };
      log(`[${room.code}] join ${n.name} (${id}), ${realPlayers(room).length} players`);
      ack({ ok: true, playerId: id, name: n.name });
      emitLobby(room);
    });

    handle(socket, 'host:start', (data, ack) => {
      const room = hostRoom(socket, data, ack);
      if (!room) return;
      if (room.state !== 'LOBBY') return ack({ ok: false, error: 'ROOM_STARTED' });
      if (!room.players.size) return ack({ ok: false, error: 'NO_PLAYERS' });
      room.rounds = Number(data.rounds) === 5 ? 5 : 3;
      room.plan = shapes.roundPlan(room.rounds);
      room.round = -1; // startRound moves to 0, the practice round
      resetTotals(room);
      log(`[${room.code}] start: ${room.rounds} rounds, ${realPlayers(room).length} players, ${ghostList(room).length} ghosts`);
      ack({ ok: true });
      startRound(room);
    });

    handle(socket, 'host:next', (data, ack) => {
      const room = hostRoom(socket, data, ack);
      if (!room) return;
      if (room.state !== 'RESULTS') return ack({ ok: false, error: 'NOT_IN_RESULTS' });
      ack({ ok: true });
      next(room);
    });

    handle(socket, 'host:again', (data, ack) => {
      const room = hostRoom(socket, data, ack);
      if (!room) return;
      clearAll(room);
      for (const p of realPlayers(room)) if (!p.connected) room.players.delete(p.id);
      room.state = 'LOBBY';
      room.round = 0;
      room.subs = new Map();
      room.extras = null;
      room.gameId = newGameId(room.isTest);
      resetTotals(room);
      saveGame(room);
      log(`[${room.code}] again: back to lobby, game ${room.gameId}`);
      ack({ ok: true });
      emitLobby(room);
    });

    handle(socket, 'host:kick', (data, ack) => {
      const room = hostRoom(socket, data, ack);
      if (!room) return;
      const p = room.players.get(data.playerId);
      if (!p) return ack({ ok: false, error: 'PLAYER_NOT_FOUND' });
      room.players.delete(p.id);
      room.subs.delete(p.id);
      const s = sockOf(p.socketId);
      if (s) {
        s.emit('player:kicked', {});
        s.leave(room.code);
        s.data = {};
        setTimeout(() => s.disconnect(true), 200);
      }
      log(`[${room.code}] kick ${p.name} (${p.id})`);
      ack({ ok: true });
      emitLobby(room);
      if (room.state === 'ROUND_ACTIVE') { emitProgress(room); checkAllIn(room); }
    });

    handle(socket, 'host:bots', (data, ack) => {
      const room = hostRoom(socket, data, ack);
      if (!room) return;
      if (room.state !== 'LOBBY') return ack({ ok: false, error: 'ROOM_STARTED' });
      const count = Math.max(0, Math.min(C.MAX_GHOSTS, Math.floor(Number(data.count)) || 0));
      for (const g of ghostList(room)) room.players.delete(g.id);
      for (let i = 1; i <= count; i++) {
        const id = 'g' + i;
        room.players.set(id, { id, name: `Ghost ${i}`, isBot: true, socketId: null, connected: false, total: 0, best: 0 });
      }
      log(`[${room.code}] ghosts: ${count}`);
      ack({ ok: true, count });
      emitLobby(room);
    });

    handle(socket, 'player:submit', (data, ack) => {
      const room = getRoom(data.code);
      const pid = data.playerId;
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      touch(room);
      const p = room.players.get(pid);
      if (!p || p.isBot || socket.data.playerId !== pid) return ack({ ok: false, error: 'UNKNOWN_PLAYER' });
      if (room.state !== 'ROUND_ACTIVE' || Number(data.round) !== room.round) return ack({ ok: false, error: 'ROUND_CLOSED' });
      if (room.subs.has(pid)) return ack({ ok: false, error: 'DUPLICATE' });
      const c = cleanStrokes(data);
      if (!c) return ack({ ok: false, error: 'BAD_DRAWING' });
      room.subs.set(pid, { ...c, receivedAt: Date.now() });
      log(`[${room.code}] submit ${p.name} round ${room.round}: ${c.nRaw} points, ${c.strokes.length} strokes${c.truncated ? ' (truncated)' : ''}`);
      ack({ ok: true });
      emitProgress(room);
      checkAllIn(room);
    });

    socket.on('disconnect', () => {
      const room = getRoom(socket.data && socket.data.code);
      if (!room) return;
      if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
        room.hostSocketId = null;
        log(`[${room.code}] host disconnected, keeping room ${T.hostGraceMs / 1000} s`);
        setTimer(room, 'hostGone', T.hostGraceMs, () => { if (!hostConnected(room)) deleteRoom(room, 'Host left'); });
        return;
      }
      const p = room.players.get(socket.data.playerId);
      if (!p || p.socketId !== socket.id) return;
      p.connected = false;
      p.socketId = null;
      log(`[${room.code}] ${p.name} disconnected (${room.state})`);
      if (room.state === 'LOBBY') {
        setTimer(room, 'lobbyGone-' + p.id, T.lobbyGraceMs, () => {
          if (room.state === 'LOBBY' && !p.connected && room.players.get(p.id) === p) { room.players.delete(p.id); emitLobby(room); }
        });
      } else if (room.state === 'ROUND_ACTIVE') {
        emitProgress(room);
        checkAllIn(room);
      }
    });
  });

  // ---------- housekeeping ----------
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) if (now - room.lastActivity > T.idleMs) deleteRoom(room, 'Idle');
  }, 60000);
  const warm = setInterval(() => {
    if ([...rooms.values()].some(hostConnected)) sf.ping();
  }, SF.ping);
  sweep.unref();
  warm.unref();

  function close() {
    clearInterval(sweep);
    clearInterval(warm);
    for (const room of rooms.values()) clearAll(room);
    rooms.clear();
  }

  return { rooms, stats, close };
}

module.exports = { createGame, resultsDelayMs };
