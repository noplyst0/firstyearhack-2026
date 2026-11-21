// Motion maths (P1-P5: 3D tangent-plane projection, One-Euro filter, 3D gimbal-spike rejection,
// median 1500..400ms calibration, min-distance sample dedup), ?debug=1 and ?mouse=1
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

  // V3 §6: FOV = 60 default (overridden by round:start payload.fov if provided)
  let fov = 60;
  let smoothing = 0.35;
  const SAMPLE_MS = 33;
  const MAX_POINTS = 2000;
  const MAX_STROKES = 20;
  const MIN_SAMPLE_DIST = 0.003; // P5: minimum distance between consecutive stroke points

  // One-Euro filter parameters (P2)
  const ONE_EURO_MIN_CUTOFF = 1.6; // Hz
  const ONE_EURO_BETA = 0.08;
  const ONE_EURO_D_CUTOFF = 1.0; // Hz

  // Sensor & pointer state
  let hasOrientationEvent = false;
  let hasMotionRate = false; // P3: separate flag so devicemotion never poisons hasOrientationEvent
  let isAbsoluteOrientation = false; // P5: track e.absolute for Android compass debugging
  let motionPermissionDenied = false;
  let listenersAttached = false;

  let rawAlpha = 0;
  let rawBeta = 0;
  let rawGamma = 0;

  let latestYaw = 0;
  let latestPitch = 0;
  let latestV = { x: 0, y: 1, z: 0 };
  let hasFirstAim = false;

  // Calibrated reference angles & 3D orthonormal tangent-plane basis (P1)
  let yaw0 = 0;
  let pitch0 = 0;
  let f0 = { x: 0, y: 1, z: 0 }; // forward unit vector
  let r0 = { x: 1, y: 0, z: 0 }; // right unit vector in tangent plane
  let u0 = { x: 0, y: 0, z: 1 }; // up unit vector in tangent plane

  // P3: 3D angular spike filter state
  let prevV = null;
  let prevOrientTs = 0;
  let spikeSkipCount = 0;

  // P2: One-Euro filter state
  let lastFilterTs = 0;
  let prevRawX = 0.5;
  let prevRawY = 0.5;
  let edx = 0;
  let edy = 0;

  // Raw un-clamped canvas coordinates & smoothed coordinates
  let rawX = 0.5;
  let rawY = 0.5;
  let sx = 0.5;
  let sy = 0.5;
  let hasSmoothed = false;

  // P4: Calibration window samples (1500 ms .. 400 ms before GO)
  let calibratingWindow = false;
  let calSamples = [];

  // Fallback rotationRate tracking when deviceorientation is completely absent
  let lastMotionTs = null;

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

  // Vector helpers for P1
  function dot3(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross3(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function norm3(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    if (len < 1e-9) return { x: 0, y: 1, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  // P1: Build orthonormal tangent-plane basis (f0, r0, u0) from calibrated forward unit vector
  function setForwardBasis(forwardVec) {
    f0 = norm3(forwardVec);
    // r0 = norm(f0 x z_up) where z_up = (0, 0, 1) -> (f0.y, -f0.x, 0)
    const horizLen = Math.hypot(f0.x, f0.y);
    if (horizLen > 1e-5) {
      r0 = { x: f0.y / horizLen, y: -f0.x / horizLen, z: 0 };
    } else {
      r0 = { x: 1, y: 0, z: 0 };
    }
    // u0 = r0 x f0
    u0 = norm3(cross3(r0, f0));

    // Keep yaw0 / pitch0 in sync for debug readout & backwards compat
    yaw0 = Math.atan2(f0.x, f0.y) / d2r;
    pitch0 = Math.asin(Math.max(-1, Math.min(1, f0.z))) / d2r;
  }

  setForwardBasis(f0);

  // P1: Gnomonic 3D tangent-plane projection (eliminates 1/cos(pitch) oval stretch & yaw wrap seam)
  function projectToCanvas(v, currentFov = fov) {
    const tanFov = 2 * Math.tan((currentFov * d2r) / 2);
    const denom = Math.max(0.25, dot3(v, f0));
    const x = 0.5 + (SIGN_X * dot3(v, r0)) / (denom * tanFov);
    const y = 0.5 - (SIGN_Y * dot3(v, u0)) / (denom * tanFov);
    return [x, y];
  }

  // P2: One-Euro low-pass filter helper
  function alphaOneEuro(dt, cutoff) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  function resetFilter(x0 = 0.5, y0 = 0.5) {
    rawX = x0;
    rawY = y0;
    prevRawX = x0;
    prevRawY = y0;
    sx = x0;
    sy = y0;
    edx = 0;
    edy = 0;
    lastFilterTs = performance.now();
    hasSmoothed = true;
  }

  function applyOneEuroFilter(nx, ny, now) {
    rawX = nx;
    rawY = ny;
    if (!hasSmoothed || lastFilterTs <= 0) {
      resetFilter(nx, ny);
      return;
    }
    const dt = Math.max(0.004, Math.min(0.2, (now - lastFilterTs) / 1000));
    lastFilterTs = now;

    const dx = (nx - prevRawX) / dt;
    const dy = (ny - prevRawY) / dt;
    prevRawX = nx;
    prevRawY = ny;

    const aD = alphaOneEuro(dt, ONE_EURO_D_CUTOFF);
    edx += aD * (dx - edx);
    edy += aD * (dy - edy);

    const cutoffX = ONE_EURO_MIN_CUTOFF + ONE_EURO_BETA * Math.abs(edx);
    const cutoffY = ONE_EURO_MIN_CUTOFF + ONE_EURO_BETA * Math.abs(edy);

    sx += alphaOneEuro(dt, cutoffX) * (nx - sx);
    sy += alphaOneEuro(dt, cutoffY) * (ny - sy);
  }

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

  // Retained for contract compatibility; live projection uses 3D tangent-plane projectToCanvas()
  function toCanvas(yaw, pitch, y0, p0, currentFov) {
    return [
      0.5 + (SIGN_X * wrap180(yaw - y0)) / currentFov,
      0.5 - (SIGN_Y * (pitch - p0)) / currentFov,
    ];
  }

  function handleDeviceOrientation(e) {
    if (MOUSE_MODE) return;
    if (e.alpha == null && e.beta == null && e.gamma == null) return;

    const now = performance.now();
    rawAlpha = Number(e.alpha) || 0;
    rawBeta = Number(e.beta) || 0;
    rawGamma = Number(e.gamma) || 0;
    isAbsoluteOrientation = Boolean(e.absolute);

    const v = norm3(aimDirection(rawAlpha, rawBeta, rawGamma));
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return;

    // P3: 3D angular-jump gimbal-spike rejection (> 20 deg in < 60 ms, up to 3 consecutive frames)
    if (prevV !== null && now - prevOrientTs < 60) {
      const cosAng = Math.max(-1, Math.min(1, dot3(v, prevV)));
      const jumpDeg = Math.acos(cosAng) / d2r;
      if (jumpDeg > 20 && spikeSkipCount < 3) {
        spikeSkipCount += 1;
        return;
      }
    }
    spikeSkipCount = 0;
    prevV = v;
    prevOrientTs = now;

    hasOrientationEvent = true;
    latestV = v;
    latestYaw = Math.atan2(v.x, v.y) / d2r;
    latestPitch = Math.asin(Math.max(-1, Math.min(1, v.z))) / d2r;

    if (!hasFirstAim) {
      hasFirstAim = true;
      setForwardBasis(v);
    }

    if (calibratingWindow) {
      calSamples.push(v);
    }

    // P1: Project onto calibrated 3D tangent plane
    const [nx, ny] = projectToCanvas(v, fov);

    // P2: Smooth with dt-normalized One-Euro filter
    applyOneEuroFilter(nx, ny, now);

    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // P3: Fallback rotationRate integration ONLY when deviceorientation has never fired
  function handleDeviceMotion(e) {
    if (MOUSE_MODE) return;
    const r = e.rotationRate;
    const now = performance.now();
    if (!r || r.beta == null) return;

    hasMotionRate = true;

    if (lastMotionTs !== null && !hasOrientationEvent) {
      const dt = (now - lastMotionTs) / 1000;
      if (dt > 0 && dt < 0.25) {
        const nx = rawX + (SIGN_X * -(Number(r.gamma) || 0) * dt) / fov;
        const ny = rawY + (SIGN_Y * -(Number(r.beta) || 0) * dt) / fov;
        applyOneEuroFilter(nx, ny, now);
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

  // Re-centre immediately (ONLY called by Lobby Re-centre button and initial lobby entry)
  function recentreNow() {
    if (hasFirstAim) {
      setForwardBasis(latestV);
    }
    resetFilter(0.5, 0.5);
    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // Collect samples during the countdown calibration window
  function beginCalibrationWindow() {
    if (calibratingWindow) return;
    calibratingWindow = true;
    calSamples = [];
  }

  function medianOfSorted(arr) {
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 !== 0 ? arr[mid] : 0.5 * (arr[mid - 1] + arr[mid]);
  }

  // Finish calibration in countdown window using component-wise median of 3D aim vectors
  function finishCalibrationWindow() {
    calibratingWindow = false;
    if (calSamples.length > 0) {
      const xs = calSamples.map((v) => v.x).sort((a, b) => a - b);
      const ys = calSamples.map((v) => v.y).sort((a, b) => a - b);
      const zs = calSamples.map((v) => v.z).sort((a, b) => a - b);
      setForwardBasis({
        x: medianOfSorted(xs),
        y: medianOfSorted(ys),
        z: medianOfSorted(zs),
      });
    } else if (hasFirstAim) {
      setForwardBasis(latestV);
    }
    calSamples = [];
    if (!MOUSE_MODE) {
      const [nx, ny] = projectToCanvas(latestV, fov);
      resetFilter(nx, ny);
    }
    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  function configureRound(opts = {}) {
    if (typeof opts.fov === 'number' && opts.fov > 0) fov = opts.fov;
    if (typeof opts.smoothing === 'number' && opts.smoothing > 0) smoothing = opts.smoothing;
  }

  function pushCurrentSample(force = false) {
    if (!drawPhaseActive || !penDown || !currentStroke) return;
    if (totalPointsCount >= MAX_POINTS) return;
    // Drop samples where |x| or |y| > 5 (sensor glitch)
    if (Math.abs(sx) > 5 || Math.abs(sy) > 5) return;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

    const pt = [round3(sx), round3(sy)];

    // P5: Minimum-distance sample deduplication (>= 0.003 canvas units)
    if (!force && currentStroke.length > 0) {
      const prev = currentStroke[currentStroke.length - 1];
      const dist = Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      if (dist < MIN_SAMPLE_DIST) return;
    }

    currentStroke.push(pt);
    totalPointsCount += 1;

    if (typeof onUpdateCb === 'function') {
      onUpdateCb(getState());
    }
  }

  // Starts a new stroke on pointerdown WITHOUT any re-centre or f0 snapshot:
  // the stroke begins at the exact (sx, sy) where the dot already was.
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
      // Ignore vibration errors
    }

    pushCurrentSample(true);

    if (typeof onPenChangeCb === 'function') {
      onPenChangeCb(true, getState());
    }
  }

  function endStroke() {
    if (!penDown) return;
    if (currentStroke && currentStroke.length === 1) {
      pushCurrentSample(true);
    } else if (currentStroke && currentStroke.length > 1) {
      pushCurrentSample(false);
    }
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

    sampleTimerId = setInterval(() => pushCurrentSample(false), SAMPLE_MS);
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

  // Update pointer coordinates from mouse/touch when ?mouse=1 is enabled.
  // Maps pointer (clientX, clientY) relative to the centred SQUARE box (size = min(width, height))
  // inside containerEl so x and y have the exact same scale and match the drawn target shape 1:1.
  function updateMouseCoordsFromEvent(e, containerEl) {
    if (!MOUSE_MODE) return;
    const rect = (containerEl || document.body).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const size = Math.min(rect.width, rect.height);
    const ox = rect.left + (rect.width - size) / 2;
    const oy = rect.top + (rect.height - size) / 2;
    const nx = (e.clientX - ox) / size;
    const ny = (e.clientY - oy) / size;
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

  // Bind hold-to-draw pointer tracking to the draw pad (using drawCanvasEl when available so ?mouse=1 aligns 1:1)
  function bindPadEvents(drawPadEl, lobbyBoxEl, drawCanvasEl) {
    const getDrawRefEl = () => {
      if (drawCanvasEl && !drawCanvasEl.classList.contains('hidden')) {
        return drawCanvasEl;
      }
      return drawPadEl;
    };

    window.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.closest('button, input, a')) {
        return;
      }
      if (
        drawPhaseActive &&
        drawPadEl &&
        typeof drawPadEl.contains === 'function' &&
        e.target &&
        e.target.nodeType &&
        !drawPadEl.contains(e.target)
      ) {
        return;
      }
      activePointers.add(e.pointerId);
      if (MOUSE_MODE) {
        const refEl = drawPhaseActive ? getDrawRefEl() : lobbyBoxEl || drawPadEl;
        updateMouseCoordsFromEvent(e, refEl);
      }
      if (drawPhaseActive && activePointers.size === 1) {
        startStroke();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!MOUSE_MODE) return;
      const isOverLobby = lobbyBoxEl && !lobbyBoxEl.closest('.hidden');
      const refEl = drawPhaseActive ? getDrawRefEl() : isOverLobby ? lobbyBoxEl : drawPadEl;
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
      hasMotionRate,
      absolute: isAbsoluteOrientation,
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
    projectToCanvas,
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
