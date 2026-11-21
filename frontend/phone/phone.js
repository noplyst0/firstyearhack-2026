// SkySketch Phone Controller — Screens 1..9 & Socket.IO websocket client (V3 Items 1..5 Complete + Centred Square Canvas Box)
(() => {
  'use strict';

  const SESSION_KEY = 'skysketch_phone_session_v2';
  const RING_CIRCUMFERENCE = 2 * Math.PI * 96; // r=96 -> ~603.19

  // --- DOM Elements ---
  const reconnectBanner = document.getElementById('reconnect-banner');
  const landscapeHint = document.getElementById('landscape-hint');
  const debugHud = document.getElementById('debug-hud');
  const debugReadout = document.getElementById('debug-readout');

  const screens = {
    join: document.getElementById('screen-join'),
    lobby: document.getElementById('screen-lobby'),
    ready: document.getElementById('screen-ready'),
    draw: document.getElementById('screen-draw'),
    judging: document.getElementById('screen-judging'),
    results: document.getElementById('screen-results'),
    final: document.getElementById('screen-final'),
    kicked: document.getElementById('screen-kicked'),
  };

  // Screen 1: Join
  const joinForm = document.getElementById('join-form');
  const urlCodePill = document.getElementById('url-code-pill');
  const urlCodeText = document.getElementById('url-code-text');
  const codeFieldWrap = document.getElementById('code-field-wrap');
  const inputCode = document.getElementById('input-code');
  const inputName = document.getElementById('input-name');
  const btnGenerateName = document.getElementById('btn-generate-name');
  const joinError = document.getElementById('join-error');
  const btnJoin = document.getElementById('btn-join');

  // Screen 2: Lobby
  const lobbyRoomBadge = document.getElementById('lobby-room-badge');
  const lobbyGreeting = document.getElementById('lobby-greeting');
  const lobbyMotionWarn = document.getElementById('lobby-motion-warn');
  const lobbyTestBox = document.getElementById('lobby-test-box');
  const lobbyDot = document.getElementById('lobby-dot');
  const btnLobbyRecentre = document.getElementById('btn-lobby-recentre');

  // Screen 3: Get ready
  const readyRoundPill = document.getElementById('ready-round-pill');
  const readyShapeMeta = document.getElementById('ready-shape-meta');
  const readyShapeTitle = document.getElementById('ready-shape-title');
  const readyDifficultyStars = document.getElementById('ready-difficulty-stars');
  const practiceBanner = document.getElementById('practice-banner');
  const memoryBanner = document.getElementById('memory-banner');
  const readyThumbWrap = document.getElementById('ready-thumb-wrap');
  const readyShapeCanvas = document.getElementById('ready-shape-canvas');
  const readyCtx = readyShapeCanvas.getContext('2d');
  const readyCountdown = document.getElementById('ready-countdown');

  // Screen 4: Draw
  const drawPracticeBanner = document.getElementById('draw-practice-banner');
  const debugDrawCanvas = document.getElementById('debug-draw-canvas');
  const debugDrawCtx = debugDrawCanvas.getContext('2d');
  const drawProgressCircle = document.getElementById('draw-progress-circle');
  const drawTimeLeft = document.getElementById('draw-time-left');
  const drawShapeHint = document.getElementById('draw-shape-hint');
  const drawDifficultyStars = document.getElementById('draw-difficulty-stars');
  const drawPenTitle = document.getElementById('draw-pen-title');
  const drawPenSub = document.getElementById('draw-pen-sub');

  // Screen 5: Judging
  const judgingHeadline = document.getElementById('judging-headline');
  const judgingChecks = document.getElementById('judging-checks');

  // Screen 6: Results
  const resPracticeBanner = document.getElementById('res-practice-banner');
  const resRoundLabel = document.getElementById('res-round-label');
  const resRank = document.getElementById('res-rank');
  const resScore = document.getElementById('res-score');
  const resReplayCanvas = document.getElementById('res-replay-canvas');
  const resReplayCtx = resReplayCanvas.getContext('2d');
  const valOnline = document.getElementById('val-online');
  const barOnline = document.getElementById('bar-online');
  const valCoverage = document.getElementById('val-coverage');
  const barCoverage = document.getElementById('bar-coverage');
  const resGuess = document.getElementById('res-guess');
  const resPercentile = document.getElementById('res-percentile');
  const resComment = document.getElementById('res-comment');
  const resPoints = document.getElementById('res-points');

  // Screen 7: Final
  const finalMyRank = document.getElementById('final-my-rank');
  const finalMyTotal = document.getElementById('final-my-total');
  const finalTop3 = document.getElementById('final-top3');

  // Screen 8: Kicked
  const btnJoinAgain = document.getElementById('btn-join-again');

  // --- State ---
  let currentScreen = 'join';
  let roomCode = '';
  let playerId = '';
  let playerName = '';
  let hasJoinedRoom = false;
  let nameWasGenerated = false;

  let lobbyNoMotionTimer = null;
  let countdownRafId = null;
  let drawRafId = null;
  let replayRafId = null;
  let activeRound = 0;
  let activeShapeId = null;
  let activeShapeName = 'shape';
  let activeDifficulty = 1;
  let activeTargetStrokes = [];
  let isMemoryRound = false;
  let isPracticeRound = false;
  let roundSubmitted = false;

  // Store extras by round so round:extras can merge cleanly even if arriving multiple times
  const extrasByRound = new Map();

  // Sync a canvas's internal pixel buffer to its actual rendered CSS dimensions and return
  // a centred SQUARE box { w, h, size, ox, oy, cx, cy } where size = min(width, height).
  function getCentredSquareBox(canvasEl) {
    const rect = canvasEl.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = rect.width > 0 ? rect.width : canvasEl.width;
    const cssH = rect.height > 0 ? rect.height : canvasEl.height;
    const targetW = Math.max(1, Math.round(cssW * dpr));
    const targetH = Math.max(1, Math.round(cssH * dpr));
    if (canvasEl.width !== targetW || canvasEl.height !== targetH) {
      canvasEl.width = targetW;
      canvasEl.height = targetH;
    }
    const w = canvasEl.width;
    const h = canvasEl.height;
    const size = Math.min(w, h);
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    return { w, h, size, ox, oy, cx: w / 2, cy: h / 2, dpr };
  }

  // Safe haptic vibration helper (V3 Item 5)
  function vibratePhone(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_e) {
      // Ignore on browsers without Vibration API
    }
  }

  // Wake Lock
  let wakeLockSentinel = null;

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch (_e) {
      // Ignore wake lock errors
    }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) {
      wakeLockSentinel.release().catch(() => {});
      wakeLockSentinel = null;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (currentScreen === 'draw' || currentScreen === 'ready')) {
      requestWakeLock();
    }
  });

  // --- Mode initialization (?debug=1, ?mouse=1, ?code=ABCD) ---
  if (SkyPointer.MOUSE_MODE) {
    document.body.classList.add('mouse-mode');
  }
  if (SkyPointer.DEBUG_MODE) {
    debugHud.classList.remove('hidden');
    debugDrawCanvas.classList.remove('hidden');
  }

  drawProgressCircle.style.strokeDasharray = `${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`;
  drawProgressCircle.style.strokeDashoffset = '0';

  const urlParams = new URLSearchParams(window.location.search);
  const urlCodeParam = (urlParams.get('code') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

  if (urlCodeParam.length === 4) {
    inputCode.value = urlCodeParam;
    codeFieldWrap.classList.add('hidden');
    urlCodeText.textContent = urlCodeParam;
    urlCodePill.classList.remove('hidden');
  }

  // Name box starts empty, placeholder "Your name"
  inputName.value = '';

  inputName.addEventListener('input', () => {
    nameWasGenerated = false;
    hideJoinError();
  });

  inputCode.addEventListener('input', () => {
    inputCode.value = inputCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    hideJoinError();
  });

  btnGenerateName.addEventListener('click', () => {
    inputName.value = SkyNames.generateName(inputName.value);
    nameWasGenerated = true;
    hideJoinError();
  });

  function shouldShowLiveLine() {
    return Boolean(isPracticeRound || SkyPointer.DEBUG_MODE);
  }

  // Bind pointer events for hold-to-draw and ?mouse=1 (passing debugDrawCanvas so ?mouse=1 uses the same square box)
  SkyPointer.bindPadEvents(screens.draw, lobbyTestBox, debugDrawCanvas);

  SkyPointer.onUpdate((st) => {
    // P5: Update ?debug=1 HUD including e.absolute flag
    if (SkyPointer.DEBUG_MODE) {
      debugReadout.textContent = `yaw: ${st.yaw.toFixed(1)}° | pitch: ${st.pitch.toFixed(1)}° | x: ${st.sx.toFixed(2)} | y: ${st.sy.toFixed(2)} | abs:${st.absolute ? 1 : 0}`;
    }

    // V3 §1: Show live line during practice round (or ?debug=1); real rounds stay blind
    if (currentScreen === 'draw' && shouldShowLiveLine()) {
      renderDebugDrawCanvas(st);
    }

    // Update Lobby test dot inside a centred square box (size = min(width, height))
    if (currentScreen === 'lobby') {
      const rect = lobbyTestBox.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const size = Math.min(rect.width, rect.height);
        const ox = (rect.width - size) / 2;
        const oy = (rect.height - size) / 2;
        const px = Math.max(16, Math.min(rect.width - 16, ox + st.sx * size));
        const py = Math.max(16, Math.min(rect.height - 16, oy + st.sy * size));
        lobbyDot.style.left = `${px.toFixed(1)}px`;
        lobbyDot.style.top = `${py.toFixed(1)}px`;
      } else {
        const clampedX = Math.max(0.06, Math.min(0.94, st.sx));
        const clampedY = Math.max(0.06, Math.min(0.94, st.sy));
        lobbyDot.style.left = `${(clampedX * 100).toFixed(1)}%`;
        lobbyDot.style.top = `${(clampedY * 100).toFixed(1)}%`;
      }

      // Hide "isn't sending motion" warning once motion arrives
      if (st.hasOrientationEvent && !st.motionPermissionDenied) {
        lobbyMotionWarn.classList.add('hidden');
      }
    }
  });

  SkyPointer.onPenChange((isDown) => {
    if (currentScreen !== 'draw' || roundSubmitted) return;
    if (isDown) {
      screens.draw.classList.add('pen-held');
      drawPenTitle.textContent = 'DRAWING...';
      drawPenSub.textContent = 'Small, steady wrist movements · Lift your thumb to stop';
    } else {
      screens.draw.classList.remove('pen-held');
      drawPenTitle.textContent = 'HOLD TO DRAW';
      drawPenSub.textContent = 'Move your phone to trace the shape';
    }
  });

  // P4: Call SkyPointer.askMotion() on Re-centre tap so refreshed iPhones can re-enable motion in 1 tap
  btnLobbyRecentre.addEventListener('click', async () => {
    if (!SkyPointer.getState().hasOrientationEvent) {
      const granted = await SkyPointer.askMotion();
      updateLobbyMotionMessages(granted);
    }
    SkyPointer.recentreNow();
  });

  // --- Landscape Orientation Warning ---
  // Only shown on get-ready ('ready') and draw ('draw') screens (never on join/lobby/results),
  // never while a text input is focused, and detected via screen.orientation.type
  // (fallback: window.matchMedia on physical screen width vs height, never viewport which shrinks when keyboard opens).
  function isTextInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = String(el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable === true;
  }

  function isDeviceLandscape() {
    if (SkyPointer.MOUSE_MODE) return false;
    if (
      window.screen &&
      window.screen.orientation &&
      typeof window.screen.orientation.type === 'string' &&
      window.screen.orientation.type.length > 0
    ) {
      return window.screen.orientation.type.startsWith('landscape');
    }
    if (typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(min-device-aspect-ratio: 1/1)');
      if (mql && typeof mql.matches === 'boolean') {
        if (
          window.screen &&
          typeof window.screen.width === 'number' &&
          typeof window.screen.height === 'number'
        ) {
          return mql.matches && window.screen.width > window.screen.height;
        }
        return mql.matches;
      }
    }
    if (
      window.screen &&
      typeof window.screen.width === 'number' &&
      typeof window.screen.height === 'number'
    ) {
      return window.screen.width > window.screen.height;
    }
    return false;
  }

  function updateLandscapeWarning() {
    if (!landscapeHint) return;
    const isAllowedScreen = currentScreen === 'ready' || currentScreen === 'draw';
    const shouldShow =
      isAllowedScreen && !isTextInputFocused() && isDeviceLandscape();
    landscapeHint.classList.toggle('visible', shouldShow);
  }

  if (
    window.screen &&
    window.screen.orientation &&
    typeof window.screen.orientation.addEventListener === 'function'
  ) {
    window.screen.orientation.addEventListener('change', updateLandscapeWarning);
  }
  window.addEventListener('orientationchange', updateLandscapeWarning);
  document.addEventListener('focusin', updateLandscapeWarning);
  document.addEventListener('focusout', updateLandscapeWarning);

  // --- Screen Switcher ---
  function showScreen(name) {
    currentScreen = name;
    for (const [key, el] of Object.entries(screens)) {
      if (key === name) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    updateLandscapeWarning();
  }

  function showJoinError(msg) {
    joinError.textContent = msg;
    joinError.classList.remove('hidden');
  }

  function hideJoinError() {
    joinError.textContent = '';
    joinError.classList.add('hidden');
  }

  function mapJoinError(errCode) {
    const code = String(errCode || '').toUpperCase();
    if (code === 'ROOM_NOT_FOUND' || code.includes('NOT FOUND')) {
      return 'No room with that code';
    }
    if (code === 'ROOM_STARTED' || code.includes('ALREADY STARTED')) {
      return 'Game already started, watch the big screen';
    }
    if (code === 'ROOM_FULL' || code.includes('FULL')) {
      return 'Room is full';
    }
    if (code === 'NAME_BLOCKED' || code.includes('BLOCKED')) {
      return 'Pick another name';
    }
    if (code === 'NAME_TAKEN' || code.includes('TAKEN')) {
      return 'That name is taken — pick another';
    }
    if (code === 'NAME_INVALID' || code.includes('INVALID') || code.includes('REQUIRED')) {
      return 'Enter a valid name';
    }
    return errCode || 'Could not join room';
  }

  function formatDifficultyStars(difficulty) {
    const d = Math.max(1, Math.min(4, Number(difficulty) || 1));
    const maxStars = Math.max(3, d);
    return '★'.repeat(d) + '☆'.repeat(maxStars - d);
  }

  // --- Session Storage ---
  function saveSession(code, id, name) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId: id, name }));
    } catch (_e) {
      // Ignore storage errors
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_e) {
      // Ignore
    }
  }

  // --- Socket.IO Setup (websocket only per plan/SHARED.md §4 & plan/phone.md) ---
  const socket =
    typeof window.io === 'function'
      ? window.io({ transports: ['websocket'] })
      : null;

  function emitJoin({ code, name, existingPlayerId, isRetry = false, isSilent = false }, doneCb) {
    if (!socket) {
      showJoinError('Realtime connection unavailable');
      if (doneCb) doneCb(false);
      return;
    }

    const payload = { code, name };
    if (existingPlayerId) payload.playerId = existingPlayerId;

    socket.emit('player:join', payload, (ack) => {
      if (ack && ack.ok) {
        roomCode = code;
        playerName = name;
        playerId = ack.playerId;
        hasJoinedRoom = true;
        saveSession(roomCode, playerId, playerName);
        hideJoinError();
        enterLobby();
        if (doneCb) doneCb(true);
        return;
      }

      const rawErr = (ack && ack.error) || 'ROOM_NOT_FOUND';
      const isNameTaken =
        rawErr === 'NAME_TAKEN' || String(rawErr).toUpperCase().includes('TAKEN');

      // NAME_TAKEN: if the name was generated, generate a new one and retry once
      if (isNameTaken && nameWasGenerated && !isRetry) {
        const nextName = SkyNames.generateName(name);
        inputName.value = nextName;
        emitJoin({ code, name: nextName, existingPlayerId, isRetry: true, isSilent }, doneCb);
        return;
      }

      if (isSilent) {
        // Silent rejoin failed (e.g. room expired), stay on join screen
        clearSession();
        hasJoinedRoom = false;
        if (doneCb) doneCb(false);
        return;
      }

      showJoinError(mapJoinError(rawErr));
      if (doneCb) doneCb(false);
    });
  }

  // Screen 1: JOIN handler
  // First line, before any await, MUST be `const motionP = askMotion();`
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const motionP = SkyPointer.askMotion();

    hideJoinError();
    const code = (urlCodeParam || inputCode.value || '').trim().toUpperCase();
    const name = (inputName.value || '').trim();

    if (code.length !== 4) {
      showJoinError('No room with that code');
      await motionP;
      return;
    }
    if (!name) {
      showJoinError('Enter your name or tap Generate');
      await motionP;
      return;
    }

    btnJoin.disabled = true;
    const saved = loadSession();
    const reclaimId = saved && saved.code === code && saved.name === name ? saved.playerId : undefined;

    emitJoin({ code, name, existingPlayerId: reclaimId }, async () => {
      btnJoin.disabled = false;
      const granted = await motionP;
      updateLobbyMotionMessages(granted);
    });
  });

  // Screen 2: Enter Lobby & check motion status
  function enterLobby() {
    lobbyRoomBadge.textContent = `ROOM ${roomCode}`;
    lobbyGreeting.textContent = `You're in, ${playerName}`;
    showScreen('lobby');
    SkyPointer.recentreNow();

    const st = SkyPointer.getState();
    updateLobbyMotionMessages(!st.motionPermissionDenied);
  }

  // P4: Add tap-to-enable motion recovery button in #lobby-motion-warn for refreshed iPhones
  function renderMotionWarningWithButton(messageText) {
    lobbyMotionWarn.innerHTML = '';
    const p = document.createElement('p');
    p.textContent = messageText;
    lobbyMotionWarn.appendChild(p);

    if (
      typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-tall';
      btn.style.marginTop = '8px';
      btn.textContent = 'Tap to Enable Motion';
      btn.addEventListener('click', async () => {
        const granted = await SkyPointer.askMotion();
        SkyPointer.recentreNow();
        updateLobbyMotionMessages(granted);
      });
      lobbyMotionWarn.appendChild(btn);
    }

    lobbyMotionWarn.classList.remove('hidden');
  }

  function updateLobbyMotionMessages(granted) {
    if (lobbyNoMotionTimer) {
      clearTimeout(lobbyNoMotionTimer);
      lobbyNoMotionTimer = null;
    }

    if (!granted || SkyPointer.getState().motionPermissionDenied) {
      renderMotionWarningWithButton(
        "Motion is blocked. Reload and tap Allow. If it doesn't ask again, check Safari's Motion & Orientation setting."
      );
      return;
    }

    lobbyMotionWarn.classList.add('hidden');

    // No orientation event within 1.5 s check
    if (!SkyPointer.getState().hasOrientationEvent) {
      lobbyNoMotionTimer = setTimeout(() => {
        if (currentScreen === 'lobby' && !SkyPointer.getState().hasOrientationEvent) {
          renderMotionWarningWithButton(
            "Your phone isn't sending motion. Tap below or watch the big screen."
          );
        }
      }, 1500);
    }
  }

  // Screen 3: Get ready (on round:start)
  function handleRoundStart(payload) {
    if (countdownRafId) cancelAnimationFrame(countdownRafId);
    if (drawRafId) cancelAnimationFrame(drawRafId);
    if (replayRafId) cancelAnimationFrame(replayRafId);

    isPracticeRound = Boolean(payload.practice || payload.round === 0);
    activeRound = payload.round ?? (isPracticeRound ? 0 : 1);
    const totalRounds = payload.totalRounds || 3;
    activeShapeId = payload.shapeId;
    activeShapeName = payload.shapeName || String(payload.shapeId || 'circle');
    activeDifficulty = Number(payload.difficulty) || 1;
    isMemoryRound = Boolean(payload.memory) && !isPracticeRound;
    roundSubmitted = false;

    const strokes =
      Array.isArray(payload.targetStrokes) && payload.targetStrokes.length > 0
        ? payload.targetStrokes
        : Array.isArray(payload.targetPoints) && payload.targetPoints.length > 0
        ? [payload.targetPoints]
        : [];
    activeTargetStrokes = strokes;

    SkyPointer.configureRound({
      fov: payload.fov,
      smoothing: payload.smoothing,
    });

    const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : 10000;
    const countdownMs = typeof payload.countdownMs === 'number' ? payload.countdownMs : 3000;

    readyRoundPill.textContent = isPracticeRound
      ? 'PRACTICE ROUND'
      : `ROUND ${activeRound} OF ${totalRounds}`;
    readyShapeTitle.textContent = activeShapeName.toUpperCase();
    readyDifficultyStars.textContent = formatDifficultyStars(activeDifficulty);

    // Show shape name, difficulty stars, and thumbnail during countdown
    readyShapeMeta.classList.remove('hidden');
    readyShapeTitle.classList.remove('hidden');
    readyDifficultyStars.classList.remove('hidden');
    readyThumbWrap.classList.remove('hidden');

    // V3 §1: Practice round banner
    if (isPracticeRound) {
      practiceBanner.classList.remove('hidden');
    } else {
      practiceBanner.classList.add('hidden');
    }

    if (isMemoryRound) {
      memoryBanner.classList.remove('hidden');
    } else {
      memoryBanner.classList.add('hidden');
    }

    showScreen('ready');
    drawShapeThumbnail(readyCtx, readyShapeCanvas, activeTargetStrokes);
    requestWakeLock();

    const startTs = performance.now();
    const endTs = startTs + countdownMs;
    let calStarted = false;
    let calFinished = false;
    let lastCountdownSec = null;

    function tickCountdown(now) {
      const rem = Math.max(0, endTs - now);

      // P4: Calibrate during 1500 ms .. 400 ms before GO (rejects thumb-tap jolts right at GO)
      if (rem <= 1500 && rem > 400 && !calStarted) {
        calStarted = true;
        SkyPointer.beginCalibrationWindow();
      }
      if (rem <= 400 && calStarted && !calFinished) {
        calFinished = true;
        SkyPointer.finishCalibrationWindow();
      }

      if (rem > 0) {
        const secs = Math.ceil(rem / 1000);
        readyCountdown.textContent = String(secs);
        // V3 Item 5: Haptic countdown tick on each 3-2-1 second transition
        if (secs !== lastCountdownSec) {
          lastCountdownSec = secs;
          vibratePhone(20);
          readyCountdown.classList.add('tick-pop');
          setTimeout(() => readyCountdown.classList.remove('tick-pop'), 140);
        }
        countdownRafId = requestAnimationFrame(tickCountdown);
      } else {
        readyCountdown.textContent = 'GO!';
        // V3 Item 5: Strong haptic pulse on GO!
        vibratePhone(70);
        // Memory round: at GO, hide the shape name, difficulty stars, and thumbnail
        if (isMemoryRound) {
          readyThumbWrap.classList.add('hidden');
          readyShapeMeta.classList.add('hidden');
          readyShapeTitle.classList.add('hidden');
          readyDifficultyStars.classList.add('hidden');
        }
        if (!calFinished) {
          if (!calStarted) SkyPointer.beginCalibrationWindow();
          SkyPointer.finishCalibrationWindow();
        }
        beginDrawScreen(durationMs);
      }
    }

    countdownRafId = requestAnimationFrame(tickCountdown);
  }

  // Draws target shape thumbnail inside a centred SQUARE box (size = min(width, height))
  function drawShapeThumbnail(ctx, canvasEl, strokes) {
    const { w, h, size, ox, oy, dpr } = getCentredSquareBox(canvasEl);
    ctx.clearRect(0, 0, w, h);

    if (!strokes || strokes.length === 0) return;

    ctx.save();
    ctx.strokeStyle = '#e8ff64'; // Matches host.css #target (--acid)
    ctx.lineWidth = 6 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      if (!Array.isArray(stroke) || stroke.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < stroke.length; i++) {
        const x = ox + stroke[i][0] * size;
        const y = oy + stroke[i][1] * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Screen 4: Draw
  function beginDrawScreen(durationMs) {
    showScreen('draw');
    screens.draw.classList.remove('pen-held', 'urgent');

    // V3 §1: Show practice banner and live line ONLY when practice is true (or ?debug=1); real rounds stay blind
    if (isPracticeRound) {
      drawPracticeBanner.classList.remove('hidden');
    } else {
      drawPracticeBanner.classList.add('hidden');
    }

    if (shouldShowLiveLine()) {
      debugDrawCanvas.classList.remove('hidden');
      renderDebugDrawCanvas(SkyPointer.getState());
    } else {
      debugDrawCanvas.classList.add('hidden');
      debugDrawCtx.clearRect(0, 0, debugDrawCanvas.width, debugDrawCanvas.height);
    }

    // Memory round: after GO, hide the shape name and difficulty stars too
    if (isMemoryRound) {
      drawShapeHint.classList.add('hidden');
      drawDifficultyStars.classList.add('hidden');
    } else {
      drawShapeHint.textContent = activeShapeName.toUpperCase();
      drawDifficultyStars.textContent = formatDifficultyStars(activeDifficulty);
      drawShapeHint.classList.remove('hidden');
      drawDifficultyStars.classList.remove('hidden');
    }

    drawPenTitle.textContent = 'HOLD TO DRAW';
    drawPenSub.textContent = 'Move your phone to trace the shape';

    SkyPointer.startDrawPhase();

    const startTs = performance.now();
    const endTs = startTs + durationMs;
    let lastUrgentSec = null;

    function tickDraw(now) {
      const rem = Math.max(0, endTs - now);
      const frac = durationMs > 0 ? rem / durationMs : 0;
      const offset = RING_CIRCUMFERENCE * (1 - frac);
      drawProgressCircle.style.strokeDashoffset = `${offset.toFixed(2)}`;
      const secsLeft = Math.ceil(rem / 1000);
      drawTimeLeft.textContent = `${secsLeft}s`;

      // V3 Item 5: Last-3s vibration & visual urgency pulse
      if (rem > 0 && rem <= 3000) {
        screens.draw.classList.add('urgent');
        if (secsLeft !== lastUrgentSec) {
          lastUrgentSec = secsLeft;
          vibratePhone(35);
        }
      }

      if (shouldShowLiveLine()) {
        renderDebugDrawCanvas(SkyPointer.getState());
      }

      if (rem > 0) {
        drawRafId = requestAnimationFrame(tickDraw);
      } else {
        finishAndSubmitDrawing();
      }
    }

    drawRafId = requestAnimationFrame(tickDraw);
  }

  // Draws practice/debug target shape, live player strokes, and cursor dot inside a centred SQUARE box (size = min(width, height))
  function renderDebugDrawCanvas(st) {
    const { w, h, size, ox, oy, dpr } = getCentredSquareBox(debugDrawCanvas);
    debugDrawCtx.clearRect(0, 0, w, h);

    // Target shape guide in --acid (#e8ff64)
    if (!isMemoryRound && activeTargetStrokes.length > 0) {
      debugDrawCtx.save();
      debugDrawCtx.strokeStyle = 'rgba(232, 255, 100, 0.42)';
      debugDrawCtx.lineWidth = 4 * dpr;
      debugDrawCtx.setLineDash([8 * dpr, 7 * dpr]);
      debugDrawCtx.lineCap = 'round';
      debugDrawCtx.lineJoin = 'round';
      for (const s of activeTargetStrokes) {
        if (!Array.isArray(s) || s.length < 2) continue;
        debugDrawCtx.beginPath();
        s.forEach((pt, idx) => {
          const x = ox + pt[0] * size;
          const y = oy + pt[1] * size;
          if (idx === 0) debugDrawCtx.moveTo(x, y);
          else debugDrawCtx.lineTo(x, y);
        });
        debugDrawCtx.stroke();
      }
      debugDrawCtx.restore();
    }

    // Recorded player strokes in --pink (#ffabcc)
    debugDrawCtx.save();
    debugDrawCtx.strokeStyle = '#ffabcc';
    debugDrawCtx.lineWidth = 6 * dpr;
    debugDrawCtx.lineCap = 'round';
    debugDrawCtx.lineJoin = 'round';
    for (const s of st.strokes) {
      if (!Array.isArray(s) || s.length < 2) continue;
      debugDrawCtx.beginPath();
      s.forEach((pt, idx) => {
        const x = ox + pt[0] * size;
        const y = oy + pt[1] * size;
        if (idx === 0) debugDrawCtx.moveTo(x, y);
        else debugDrawCtx.lineTo(x, y);
      });
      debugDrawCtx.stroke();
    }
    debugDrawCtx.restore();

    // Live cursor dot mapped with the exact same square box
    debugDrawCtx.save();
    debugDrawCtx.fillStyle = st.penDown ? '#ffabcc' : '#e8ff64';
    debugDrawCtx.strokeStyle = '#ffffff';
    debugDrawCtx.lineWidth = 2.5 * dpr;
    debugDrawCtx.beginPath();
    debugDrawCtx.arc(ox + st.sx * size, oy + st.sy * size, 8 * dpr, 0, Math.PI * 2);
    debugDrawCtx.fill();
    debugDrawCtx.stroke();
    debugDrawCtx.restore();
  }

  function finishAndSubmitDrawing() {
    if (roundSubmitted) return;
    roundSubmitted = true;

    const { strokes, points } = SkyPointer.stopDrawPhase();
    screens.draw.classList.remove('pen-held', 'urgent');
    vibratePhone([40, 50, 40]);
    drawTimeLeft.textContent = '0s';
    drawPenTitle.textContent = 'Drawing sent';
    drawPenSub.textContent = 'Look at the big screen!';

    if (socket && roomCode && playerId) {
      socket.emit('player:submit', {
        code: roomCode,
        playerId,
        round: activeRound,
        strokes,
        points,
      });
    }
  }

  // Screen 5: Judging (on round:judging)
  function handleRoundJudging(payload) {
    if (drawRafId) cancelAnimationFrame(drawRafId);
    if (!roundSubmitted && currentScreen === 'draw') {
      finishAndSubmitDrawing();
    }
    judgingHeadline.textContent = 'Snowflake is judging...';
    const checks = payload && payload.distanceChecks;
    judgingChecks.textContent =
      typeof checks === 'number'
        ? `${checks.toLocaleString()} distance checks`
        : '';
    showScreen('judging');
  }

  // Ordinal helper (1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th"...)
  function formatOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // V3 Item 4: Render & animate player's normalised pathStrokes over targetNormStrokes / targetNorm
  // inside a centred SQUARE box (size = min(width, height))
  function animateMiniReplay(targetStrokesNorm, playerStrokesNorm) {
    if (replayRafId) cancelAnimationFrame(replayRafId);

    const totalPlayerPts = (playerStrokesNorm || []).reduce(
      (sum, s) => sum + (Array.isArray(s) ? s.length : 0),
      0
    );

    const durationMs = 950;
    const startTs = performance.now();

    function drawFrame(now) {
      const { w, h, size, cx, cy, dpr } = getCentredSquareBox(resReplayCanvas);
      const scale = size / 5;
      const progress = Math.min(1, (now - startTs) / durationMs);
      resReplayCtx.clearRect(0, 0, w, h);

      // 1. Draw normalised target strokes
      if (Array.isArray(targetStrokesNorm) && targetStrokesNorm.length > 0) {
        resReplayCtx.save();
        resReplayCtx.strokeStyle = 'rgba(232, 255, 100, 0.45)';
        resReplayCtx.lineWidth = 4.5 * dpr;
        resReplayCtx.lineCap = 'round';
        resReplayCtx.lineJoin = 'round';
        for (const stroke of targetStrokesNorm) {
          if (!Array.isArray(stroke) || stroke.length < 2) continue;
          resReplayCtx.beginPath();
          for (let i = 0; i < stroke.length; i++) {
            const px = cx + stroke[i][0] * scale;
            const py = cy + stroke[i][1] * scale;
            if (i === 0) resReplayCtx.moveTo(px, py);
            else resReplayCtx.lineTo(px, py);
          }
          resReplayCtx.stroke();
        }
        resReplayCtx.restore();
      }

      // 2. Draw player's normalised pathStrokes up to `progress`
      if (totalPlayerPts > 0 && Array.isArray(playerStrokesNorm)) {
        let ptsBudget = Math.max(2, Math.ceil(totalPlayerPts * progress));
        resReplayCtx.save();
        resReplayCtx.strokeStyle = '#ffabcc';
        resReplayCtx.lineWidth = 5.5 * dpr;
        resReplayCtx.lineCap = 'round';
        resReplayCtx.lineJoin = 'round';

        for (const stroke of playerStrokesNorm) {
          if (!Array.isArray(stroke) || stroke.length < 2 || ptsBudget <= 0) continue;
          const count = Math.min(stroke.length, ptsBudget);
          ptsBudget -= count;
          if (count < 2) continue;

          resReplayCtx.beginPath();
          for (let i = 0; i < count; i++) {
            const px = cx + stroke[i][0] * scale;
            const py = cy + stroke[i][1] * scale;
            if (i === 0) resReplayCtx.moveTo(px, py);
            else resReplayCtx.lineTo(px, py);
          }
          resReplayCtx.stroke();
        }
        resReplayCtx.restore();
      }

      if (progress < 1) {
        replayRafId = requestAnimationFrame(drawFrame);
      }
    }

    replayRafId = requestAnimationFrame(drawFrame);
  }

  // Screen 6: Results (on round:results, then round:extras)
  function handleRoundResults(payload) {
    releaseWakeLock();
    const practice = Boolean(payload.practice || payload.round === 0 || isPracticeRound);
    const round = payload.round ?? activeRound ?? (practice ? 0 : 1);
    activeRound = round;
    const shapeId = payload.shapeId ?? activeShapeId;
    const shapeName = payload.shapeName || activeShapeName || 'shape';
    const results = Array.isArray(payload.results) ? payload.results : [];

    const realPlayers = results.filter((r) => !r.isBot);
    const totalReal = realPlayers.length || results.length || 1;
    const mine = results.find((r) => r.playerId === playerId);

    if (practice) {
      resPracticeBanner.classList.remove('hidden');
      resRoundLabel.textContent = 'PRACTICE ROUND';
    } else {
      resPracticeBanner.classList.add('hidden');
      resRoundLabel.textContent = `ROUND ${round}`;
    }

    // Extract targetNormStrokes (V3 §2) or fallback to [targetNorm]
    const targetNormStrokes =
      Array.isArray(payload.targetNormStrokes) && payload.targetNormStrokes.length > 0
        ? payload.targetNormStrokes
        : Array.isArray(payload.targetNorm) && payload.targetNorm.length > 0
        ? [payload.targetNorm]
        : [];
    const myPathStrokes = mine && Array.isArray(mine.pathStrokes) ? mine.pathStrokes : [];

    const isValid = mine ? mine.valid !== false : false;
    if (!mine || !isValid) {
      resScore.textContent = 'No drawing';
      resRank.textContent = 'No drawing';
      valOnline.textContent = '0%';
      barOnline.style.width = '0%';
      valCoverage.textContent = '0%';
      barCoverage.style.width = '0%';
      resGuess.textContent = '';
    } else {
      const scoreNum = typeof mine.score === 'number' ? Math.round(mine.score * 10) / 10 : 0;
      resScore.textContent = `${scoreNum}%`;

      const rankNum = mine.rank || realPlayers.findIndex((r) => r.playerId === playerId) + 1;
      resRank.textContent = rankNum > 0 ? `${formatOrdinal(rankNum)} of ${totalReal}` : `of ${totalReal}`;

      const onLineVal = Math.round(mine.onLine ?? mine.accuracy ?? 0);
      const covVal = Math.round(mine.coverage ?? mine.smoothness ?? mine.accuracy ?? 0);

      valOnline.textContent = `${onLineVal}%`;
      barOnline.style.width = `${Math.max(0, Math.min(100, onLineVal))}%`;

      valCoverage.textContent = `${covVal}%`;
      barCoverage.style.width = `${Math.max(0, Math.min(100, covVal))}%`;

      if (mine.guess && mine.guess.label) {
        const matched =
          String(mine.guess.shapeId) === String(shapeId) ||
          mine.guess.label.toLowerCase().replace(/^an?\s+/, '') === shapeName.toLowerCase();
        if (matched) {
          resGuess.textContent = `Snowflake recognised your ${shapeName}`;
        } else {
          resGuess.textContent = `Snowflake thinks you drew ${mine.guess.label}`;
        }
      } else {
        resGuess.textContent = '';
      }
    }

    const roundPts = practice ? 0 : mine ? (mine.roundPoints ?? mine.points ?? 0) : 0;
    const totalPts = mine ? (mine.totalPoints ?? roundPts) : 0;
    resPoints.textContent = `+${roundPts} · total ${totalPts}`;

    resPercentile.classList.add('hidden');
    resPercentile.textContent = '';

    if (mine && mine.comment) {
      resComment.textContent = mine.comment;
    } else {
      resComment.textContent = 'Snowflake is writing a joke...';
    }

    applyExtrasToResultsUI(round, shapeName);
    showScreen('results');
    animateMiniReplay(targetNormStrokes, myPathStrokes);
  }

  function handleRoundExtras(payload) {
    if (!payload) return;
    const round = payload.round ?? activeRound;
    const prev = extrasByRound.get(round) || { comments: {}, percentiles: {} };

    if (payload.comments && typeof payload.comments === 'object') {
      Object.assign(prev.comments, payload.comments);
    }
    if (payload.percentiles && typeof payload.percentiles === 'object') {
      Object.assign(prev.percentiles, payload.percentiles);
    }
    extrasByRound.set(round, prev);

    if (round === activeRound) {
      applyExtrasToResultsUI(round, activeShapeName);
    }
  }

  function applyExtrasToResultsUI(round, shapeName) {
    const ext = extrasByRound.get(round);
    if (!ext) return;

    if (playerId && ext.comments && ext.comments[playerId]) {
      resComment.textContent = ext.comments[playerId];
    }

    if (playerId && ext.percentiles && ext.percentiles[playerId]) {
      const p = ext.percentiles[playerId];
      if (typeof p.beatPct === 'number' && typeof p.pool === 'number') {
        resPercentile.textContent = `Better than ${Math.round(p.beatPct)}% of today's ${shapeName}s (${p.pool} drawn)`;
        resPercentile.classList.remove('hidden');
      }
    }
  }

  // Screen 7: Final (on game:end)
  function handleGameEnd(payload) {
    releaseWakeLock();
    const lb = Array.isArray(payload && payload.leaderboard) ? payload.leaderboard : [];
    const totalPlayers = lb.length || 1;
    const myIdx = lb.findIndex((p) => p.playerId === playerId);
    const mine = myIdx >= 0 ? lb[myIdx] : null;

    if (mine) {
      finalMyRank.textContent = `${formatOrdinal(myIdx + 1)} of ${totalPlayers}`;
      finalMyTotal.textContent = `${mine.total ?? 0} pts`;
    } else {
      finalMyRank.textContent = `Out of ${totalPlayers}`;
      finalMyTotal.textContent = '0 pts';
    }

    finalTop3.innerHTML = '';
    lb.slice(0, 3).forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'top3-item' + (entry.playerId === playerId ? ' is-me' : '');
      row.innerHTML = `
        <span>#${i + 1} ${escapeHtml(entry.name || 'Player')}</span>
        <span>${entry.total ?? 0} pts</span>
      `;
      finalTop3.appendChild(row);
    });

    showScreen('final');
  }

  // Screen 8: Kicked (on player:kicked)
  function handlePlayerKicked() {
    releaseWakeLock();
    clearSession();
    hasJoinedRoom = false;
    playerId = '';
    showScreen('kicked');
  }

  btnJoinAgain.addEventListener('click', () => {
    hideJoinError();
    showScreen('join');
  });

  // --- Wire Socket Events ---
  if (socket) {
    socket.on('connect', () => {
      reconnectBanner.classList.add('hidden');

      // Auto re-join with saved session on load or reconnect
      const saved = loadSession();
      if (saved && saved.code && saved.playerId && saved.name) {
        const matchesUrl = !urlCodeParam || urlCodeParam === saved.code;
        if (matchesUrl) {
          emitJoin({
            code: saved.code,
            name: saved.name,
            existingPlayerId: saved.playerId,
            isSilent: true,
          });
        }
      }
    });

    socket.on('disconnect', () => {
      if (hasJoinedRoom) {
        reconnectBanner.classList.remove('hidden');
      }
    });

    socket.on('connect_error', () => {
      if (hasJoinedRoom) {
        reconnectBanner.classList.remove('hidden');
      }
    });

    socket.on('lobby:update', () => {
      if (hasJoinedRoom && (currentScreen === 'final' || currentScreen === 'results')) {
        enterLobby();
      }
    });

    socket.on('round:start', handleRoundStart);
    socket.on('round:judging', handleRoundJudging);
    socket.on('round:results', handleRoundResults);
    socket.on('round:extras', handleRoundExtras);
    socket.on('game:end', handleGameEnd);
    socket.on('player:kicked', handlePlayerKicked);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }
})();
