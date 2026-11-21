// Motion maths, calibration, hold-to-draw stroke recording, ?debug=1 and ?mouse=1 (plan/phone.md)
(() => {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const DEBUG_MODE = params.get('debug') === '1';
  const MOUSE_MODE = params.get('mouse') === '1';

  const d2r = Math.PI / 180;
  const wrap180 = (a) => ((a + 540) % 360) - 180;
  const round3 = (v) => Math.round(v * 1000) / 1000;

  let SIGN_X = 1;
  let SIGN_Y = 1;

  // Defaults from plan/SHARED.md §5 (can be overridden by round:start payload)
  let fov = 40;
  let smoothing = 0.35;
  const SAMPLE_MS = 33;
  const MAX_POINTS = 2000;
  const MAX_STROKES = 20;

  // Sensor & pointer state
  let hasOrientationEvent = false;
  let motionPermissionDenied = false;
  let listenersAttached = false;

  let rawAlpha = 0;
  let rawBeta = 0;
  let rawGamma = 0;

  let latestYaw = 0;
  let latestPitch = 0;
  let hasFirstAim = false;

  let yaw0 = 0;
  let pitch0 = 0;

  // Raw un-clamped canvas coordinates & smoothed coordinates
  let rawX = 0.5;
  let rawY = 0.5;
  let sx = 0.5;
  let sy = 0.5;
  let hasSmoothed = false;

  // Calibration window samples during last 500 ms of countdown
  let calibratingWindow = false;
  let calSamples = [];

  // Fallback rotationRate tracking when upright angles jump
  let lastMotionTs = null;
  let prevOrientationYaw = null;
  let useRateFallbackUntil = 0;

  // Hold-to-draw state
  let drawPhaseActive = false;
  const activePointers = new Set();
  let penDown = false;
  let strokes = [];
  let currentStroke = null;
  let totalPointsCount = 0;
  let sampleTimerId = null;

  // Callbacks
  let onUpdateCb = null;
  let onPenChangeCb = null;

  // MUST be called as the very first line inside the JOIN tap handler, before any await (iOS requirement)
  function askMotion() {
    if (MOUSE_MODE) {
      attachMotionListeners();
      return Promise.resolve(true);
    }
    const asks = [];
    for (const E of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
      if (E && typeof E.requestPermission === 'function') {
        asks.push(E.requestPermission().catch(() => 'denied'));
      }
    }
    return Promise.all(asks).then((r) => {
      const granted = r.every((x) => x === 'granted');
      motionPermissionDenied = !granted;
      if (granted) {
        attachMotionListeners();
      }
      return granted;
    });
  }

  // Direction the BACK of the phone faces (W3C Z-X'-Y'')
  function aimDirection(alpha, beta, gamma) {
    const a = alpha * d2r;
    const b = beta * d2r;
    const g = gamma * d2r;
    return {
      x: -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g),
      y: -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g),
      z: -Math.cos(b) * Math.cos(g),
    };
  }

  function yawPitch(alpha, beta, gamma) {
    const v = aimDirection(alpha, beta, gamma);
    return {
      yaw: Math.atan2(v.x, v.y) / d2r,
      pitch: Math.asin(Math.max(-1, Math.min(1, v.z))) / d2r,
    };
  }

  // NO clamp: scoring ignores position and size
  function toCanvas(yaw, pitch, y0, p0, currentFov) {
    return [
      0.5 + (SIGN_X * wrap180(yaw - y0)) / currentFov,
      0.5 - (SIGN_Y * (pitch - p0)) / currentFov,
    ];
  }

  function handleDeviceOrientation(e) {
    if (MOUSE_MODE) return;
    if (e.alpha == null && e.beta == null && e.gamma == null) return;

    rawAlpha = Number(e.alpha) || 0;
    rawBeta = Number(e.beta) || 0;
    rawGamma = Number(e.gamma) || 0;
    hasOrientationEvent = true;

    const { yaw, pitch } = yawPitch(rawAlpha, rawBeta, rawGamma);
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;

    // Detect sudden gimbal azimuth jump when held nearly vertical/horizontal
    if (prevOrientationYaw !== null && Math.abs(wrap180(yaw - prevOrientationYaw)) > 75) {
      useRateFallbackUntil = performance.now() + 350;
    }
    prevOrientationYaw = yaw;

    latestYaw = yaw;
    latestPitch = pitch;

    if (!hasFirstAim) {
      hasFirstAim = true;
      yaw0 = yaw;
      pitch0 = pitch;
    }

    if (calibratingWindow) {
      calSamples.push({ yaw, pitch });
    }

    if (performance.now() < useRateFallbackUntil) {
      return;
    }

    const [nx, ny] = toCanvas(yaw, pitch, yaw0, pitch0, fov);
    rawX = nx;
    rawY = ny;

    if (!hasSmoothed) {
      sx = nx;
      sy = ny;
      hasSmoothed = true;
    } else {
      sx += smoothing * (nx - sx);
      sy += smoothing * (ny - sy);
    }

    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // Fallback rotationRate integration if orientation angles jump while upright
  function handleDeviceMotion(e) {
    if (MOUSE_MODE) return;
    const r = e.rotationRate;
    const now = performance.now();
    if (!r || r.beta == null) return;

    if (lastMotionTs !== null) {
      const dt = (now - lastMotionTs) / 1000;
      if (dt > 0 && dt < 0.25 && (!hasOrientationEvent || now < useRateFallbackUntil)) {
        hasOrientationEvent = true;
        rawX += (SIGN_X * -(Number(r.gamma) || 0) * dt) / fov;
        rawY += (SIGN_Y * -(Number(r.beta) || 0) * dt) / fov;
        if (!hasSmoothed) {
          sx = rawX;
          sy = rawY;
          hasSmoothed = true;
        } else {
          sx += smoothing * (rawX - sx);
          sy += smoothing * (rawY - sy);
        }
        if (typeof onUpdateCb === 'function') {
          onUpdateCb(getState());
        }
      }
    }
    lastMotionTs = now;
  }

  function attachMotionListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    window.addEventListener('devicemotion', handleDeviceMotion, true);
  }

  // Attach immediately on Android / desktop where requestPermission isn't required
  if (
    !MOUSE_MODE &&
    typeof window.DeviceOrientationEvent !== 'undefined' &&
    typeof window.DeviceOrientationEvent.requestPermission !== 'function'
  ) {
    attachMotionListeners();
  }

  // Re-centre immediately (used by Lobby Re-centre button)
  function recentreNow() {
    yaw0 = latestYaw;
    pitch0 = latestPitch;
    rawX = 0.5;
    rawY = 0.5;
    sx = 0.5;
    sy = 0.5;
    hasSmoothed = true;
    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // Start collecting samples over the last 500 ms of the countdown
  function beginCalibrationWindow() {
    if (calibratingWindow) return;
    calibratingWindow = true;
    calSamples = [];
  }

  // Finish calibration at GO using the exact plan/phone.md formula:
  // yaw0 = first yaw + average of wrap180(yaw - first yaw) over the last 500 ms
  // pitch0 = average pitch over the same window
  function finishCalibrationWindow() {
    calibratingWindow = false;
    if (calSamples.length > 0) {
      const firstYaw = calSamples[0].yaw;
      const avgDelta =
        calSamples.reduce((sum, s) => sum + wrap180(s.yaw - firstYaw), 0) / calSamples.length;
      yaw0 = firstYaw + avgDelta;
      pitch0 = calSamples.reduce((sum, s) => sum + s.pitch, 0) / calSamples.length;
    } else if (hasFirstAim) {
      yaw0 = latestYaw;
      pitch0 = latestPitch;
    }
    calSamples = [];
    if (!MOUSE_MODE) {
      const [nx, ny] = toCanvas(latestYaw, latestPitch, yaw0, pitch0, fov);
      rawX = nx;
      rawY = ny;
      sx = nx;
      sy = ny;
      hasSmoothed = true;
    }
    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  function configureRound(opts = {}) {
    if (typeof opts.fov === 'number' && opts.fov > 0) fov = opts.fov;
    if (typeof opts.smoothing === 'number' && opts.smoothing > 0) smoothing = opts.smoothing;
  }

  function pushCurrentSample() {
    if (!drawPhaseActive || !penDown || !currentStroke) return;
    if (totalPointsCount >= MAX_POINTS) return;
    // Drop samples where |x| or |y| > 5 (sensor glitch)
    if (Math.abs(sx) > 5 || Math.abs(sy) > 5) return;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

    currentStroke.push([round3(sx), round3(sy)]);
    totalPointsCount += 1;

    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  function startStroke() {
    if (!drawPhaseActive) return;
    if (penDown) return;
    if (strokes.length >= MAX_STROKES || totalPointsCount >= MAX_POINTS) return;

    penDown = true;
    currentStroke = [];
    strokes.push(currentStroke);

    try {
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (_e) {
      // Ignore vibration errors on unsupported browsers
    }

    pushCurrentSample();

    if (typeof onPenChangeCb === 'function') {
      onPenChangeCb(true, getState());
    }
  }

  function endStroke() {
    if (!penDown) return;
    penDown = false;
    if (currentStroke && currentStroke.length === 0) {
      strokes.pop();
    }
    currentStroke = null;
    if (typeof onPenChangeCb === 'function') {
      onPenChangeCb(false, getState());
    }
  }

  // Begin the draw phase (at GO)
  function startDrawPhase() {
    if (sampleTimerId) clearInterval(sampleTimerId);
    strokes = [];
    currentStroke = null;
    totalPointsCount = 0;
    penDown = false;
    drawPhaseActive = true;

    // A finger already down at GO starts a stroke at GO
    if (activePointers.size > 0) {
      startStroke();
    }

    sampleTimerId = setInterval(pushCurrentSample, SAMPLE_MS);
  }

  // End the draw phase (when durationMs expires) and return { strokes, points }
  function stopDrawPhase() {
    if (sampleTimerId) {
      clearInterval(sampleTimerId);
      sampleTimerId = null;
    }
    endStroke();
    drawPhaseActive = false;

    const cleanStrokes = strokes.filter((s) => Array.isArray(s) && s.length > 0);
    return {
      strokes: cleanStrokes,
      points: cleanStrokes.flat(),
    };
  }

  // Update pointer coordinates from mouse/touch when ?mouse=1 is enabled
  function updateMouseCoordsFromEvent(e, containerEl) {
    if (!MOUSE_MODE) return;
    const rect = (containerEl || document.body).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    rawX = nx;
    rawY = ny;
    sx = nx;
    sy = ny;
    hasSmoothed = true;
    hasOrientationEvent = true;
    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // Bind hold-to-draw pointer tracking to the draw pad (and window for finger already held during Get Ready)
  function bindPadEvents(drawPadEl, lobbyBoxEl) {
    window.addEventListener('pointerdown', (e) => {
      // Ignore clicks on buttons/inputs outside the draw pad when not in draw/get-ready
      if (e.target && e.target.closest('button, input, a')) {
        return;
      }
      activePointers.add(e.pointerId);
      if (MOUSE_MODE) {
        const refEl = drawPhaseActive ? drawPadEl : lobbyBoxEl || drawPadEl;
        updateMouseCoordsFromEvent(e, refEl);
      }
      if (drawPhaseActive && activePointers.size === 1) {
        startStroke();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!MOUSE_MODE) return;
      const isOverLobby = lobbyBoxEl && !lobbyBoxEl.closest('.hidden');
      const refEl = drawPhaseActive ? drawPadEl : isOverLobby ? lobbyBoxEl : drawPadEl;
      updateMouseCoordsFromEvent(e, refEl);
    });

    const handleRelease = (e) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0 && drawPhaseActive) {
        endStroke();
      }
    };

    window.addEventListener('pointerup', handleRelease);
    window.addEventListener('pointercancel', handleRelease);
    window.addEventListener('blur', () => {
      activePointers.clear();
      if (drawPhaseActive) endStroke();
    });
  }

  function getState() {
    return {
      debugMode: DEBUG_MODE,
      mouseMode: MOUSE_MODE,
      hasOrientationEvent: hasOrientationEvent || MOUSE_MODE,
      motionPermissionDenied,
      alpha: rawAlpha,
      beta: rawBeta,
      gamma: rawGamma,
      yaw: latestYaw,
      pitch: latestPitch,
      yaw0,
      pitch0,
      x: rawX,
      y: rawY,
      sx,
      sy,
      penDown,
      drawPhaseActive,
      strokes,
      totalPointsCount,
      fov,
      smoothing,
    };
  }

  window.SkyPointer = {
    DEBUG_MODE,
    MOUSE_MODE,
    askMotion,
    aimDirection,
    yawPitch,
    toCanvas,
    wrap180,
    round3,
    recentreNow,
    beginCalibrationWindow,
    finishCalibrationWindow,
    configureRound,
    startDrawPhase,
    stopDrawPhase,
    bindPadEvents,
    getState,
    onUpdate(fn) {
      onUpdateCb = fn;
    },
    onPenChange(fn) {
      onPenChangeCb = fn;
    },
  };
})();
