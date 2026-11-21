(() => {
  "use strict";

  // --- DOM Elements ---
  const motionPill = document.getElementById("motion-pill");
  const socketPill = document.getElementById("socket-pill");
  const btnEnableMotion = document.getElementById("btn-enable-motion");
  const btnRecentre = document.getElementById("btn-recentre");
  const btnClearTrail = document.getElementById("btn-clear-trail");

  const dbgAlpha = document.getElementById("dbg-alpha");
  const dbgBeta = document.getElementById("dbg-beta");
  const dbgGamma = document.getElementById("dbg-gamma");
  const dbgXY = document.getElementById("dbg-xy");
  const dbgStatus = document.getElementById("dbg-status");
  const chkInvertX = document.getElementById("chk-invert-x");
  const chkInvertY = document.getElementById("chk-invert-y");

  const screenJoin = document.getElementById("screen-join");
  const joinForm = document.getElementById("join-form");
  const inputCode = document.getElementById("input-code");
  const inputName = document.getElementById("input-name");
  const joinMsg = document.getElementById("join-msg");

  const screenLobby = document.getElementById("screen-lobby");
  const lobbyCode = document.getElementById("lobby-code");
  const lobbyPlayerName = document.getElementById("lobby-player-name");
  const lobbyPlayers = document.getElementById("lobby-players");

  const screenRoundBanner = document.getElementById("screen-round-banner");
  const roundLabel = document.getElementById("round-label");
  const roundShapeName = document.getElementById("round-shape-name");
  const roundTimer = document.getElementById("round-timer");

  const canvasModeLabel = document.getElementById("canvas-mode-label");
  const sampleCountEl = document.getElementById("sample-count");
  const canvas = document.getElementById("motion-canvas");
  const ctx = canvas.getContext("2d");

  const screenResults = document.getElementById("screen-results");
  const resultsTitle = document.getElementById("results-title");
  const resultsWinnerBadge = document.getElementById("results-winner-badge");
  const myScoreVal = document.getElementById("my-score-val");
  const myPointsEarned = document.getElementById("my-points-earned");
  const myAccVal = document.getElementById("my-acc-val");
  const mySmoothVal = document.getElementById("my-smooth-val");
  const myAiComment = document.getElementById("my-ai-comment");
  const resultsList = document.getElementById("results-list");

  const screenGameover = document.getElementById("screen-gameover");
  const finalLeaderboard = document.getElementById("final-leaderboard");
  const finalStats = document.getElementById("final-stats");
  const btnPlayAgain = document.getElementById("btn-play-again");

  // --- Motion & Orientation State ---
  // Half-angle span in degrees from centre to edge (0..1 maps to -HALF_SPAN..+HALF_SPAN)
  const HALF_SPAN_DEG = 25;
  let motionEnabled = false;
  let hasCalibrated = false;

  let rawAlpha = null;
  let rawBeta = null;
  let rawGamma = null;

  let centerAlpha = 0;
  let centerBeta = 45; // Comfortable default phone holding pitch

  // Normalised pointer coordinates in [0, 1]
  let pointerX = 0.5;
  let pointerY = 0.5;

  // Smoothing low-pass filter to keep dot responsive without sensor micro-tremor
  const SMOOTH_FACTOR = 0.35;

  // Test trail vs Active round recorded points
  const MAX_TEST_TRAIL = 220;
  let trailPoints = []; // [[x, y], ...]

  // Active Game / Round State
  let roomCode = "";
  let playerId = "";
  let playerName = "";
  let inActiveRound = false;
  let activeRoundNum = 1;
  let activeShapeId = "circle";
  let targetPoints = []; // [[x, y], ...] in 0..1
  let roundPoints = [];  // [[x, y], ...] sampled at ~30/s during round
  let roundEndTime = 0;
  let sampleIntervalId = null;
  let countdownRafId = null;

  // Pre-fill room code from URL query if present (e.g. /?code=ABCD)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("code")) {
    inputCode.value = urlParams.get("code").toUpperCase().slice(0, 4);
  }

  // --- Angle Helpers ---
  // Shortest signed angular difference (a - b) in degrees within [-180, 180]
  function shortestAngleDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function round4(v) {
    return Math.round(v * 10000) / 10000;
  }

  // Recentre current orientation to canvas center (0.5, 0.5)
  function recentrePointer() {
    if (rawAlpha !== null && rawBeta !== null) {
      centerAlpha = rawAlpha;
      centerBeta = rawBeta;
      hasCalibrated = true;
      pointerX = 0.5;
      pointerY = 0.5;
      dbgStatus.textContent = `Recentred at α=${centerAlpha.toFixed(1)}°, β=${centerBeta.toFixed(1)}°`;
    } else {
      pointerX = 0.5;
      pointerY = 0.5;
      dbgStatus.textContent = "Pointer reset to (0.50, 0.50). Waiting for gyro sensor...";
    }
    updateDebugReadout();
  }

  function handleOrientation(event) {
    if (event.alpha === null && event.beta === null && event.gamma === null) {
      return;
    }

    rawAlpha = typeof event.alpha === "number" ? event.alpha : 0;
    rawBeta = typeof event.beta === "number" ? event.beta : 0;
    rawGamma = typeof event.gamma === "number" ? event.gamma : 0;

    if (!motionEnabled) {
      motionEnabled = true;
      motionPill.textContent = "Gyro: Active";
      motionPill.className = "pill pill-ok";
      btnEnableMotion.textContent = "Motion Active ✓";
    }

    if (!hasCalibrated) {
      centerAlpha = rawAlpha;
      centerBeta = rawBeta;
      hasCalibrated = true;
    }

    // Yaw (alpha): rotating phone left increases alpha, rotating right decreases alpha.
    // So pointing right => rawAlpha - centerAlpha < 0 => positive X delta when negated.
    let deltaYaw = -shortestAngleDiff(rawAlpha, centerAlpha);
    // Pitch (beta): tilting phone up increases beta => move dot up (negative Y delta on canvas).
    let deltaPitch = -(rawBeta - centerBeta);

    if (chkInvertX.checked) deltaYaw = -deltaYaw;
    if (chkInvertY.checked) deltaPitch = -deltaPitch;

    const targetX = clamp01(0.5 + deltaYaw / (HALF_SPAN_DEG * 2));
    const targetY = clamp01(0.5 + deltaPitch / (HALF_SPAN_DEG * 2));

    pointerX = pointerX + SMOOTH_FACTOR * (targetX - pointerX);
    pointerY = pointerY + SMOOTH_FACTOR * (targetY - pointerY);

    if (!inActiveRound) {
      trailPoints.push([pointerX, pointerY]);
      if (trailPoints.length > MAX_TEST_TRAIL) {
        trailPoints.shift();
      }
      sampleCountEl.textContent = `${trailPoints.length} pts`;
    }

    updateDebugReadout();
  }

  function updateDebugReadout() {
    dbgAlpha.textContent = rawAlpha !== null ? `${rawAlpha.toFixed(1)}°` : "--";
    dbgBeta.textContent = rawBeta !== null ? `${rawBeta.toFixed(1)}°` : "--";
    dbgGamma.textContent = rawGamma !== null ? `${rawGamma.toFixed(1)}°` : "--";
    dbgXY.textContent = `${pointerX.toFixed(2)}, ${pointerY.toFixed(2)}`;
  }

  // Request iOS 13+ DeviceOrientationEvent permission on button tap
  async function requestMotionPermission() {
    try {
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        dbgStatus.textContent = "Requesting iOS motion permission...";
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== "granted") {
          motionPill.textContent = "Gyro: Denied";
          motionPill.className = "pill pill-warn";
          dbgStatus.textContent = "iOS motion permission denied. Reload over HTTPS to retry.";
          return;
        }
      }

      window.addEventListener("deviceorientation", handleOrientation, true);
      motionPill.textContent = "Gyro: Listening";
      motionPill.className = "pill pill-ok";
      btnEnableMotion.textContent = "Motion Enabled ✓";
      dbgStatus.textContent = "Gyroscope listening! Tilt phone to steer dot.";
      recentrePointer();
    } catch (err) {
      dbgStatus.textContent = `Motion error: ${err.message || err} (HTTPS required on iOS)`;
    }
  }

  btnEnableMotion.addEventListener("click", requestMotionPermission);
  btnRecentre.addEventListener("click", recentrePointer);
  btnClearTrail.addEventListener("click", () => {
    trailPoints = [];
    if (!inActiveRound) {
      sampleCountEl.textContent = "0 pts";
    }
  });

  // Also attach listener immediately for Android / desktop devices that don't require requestPermission()
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission !== "function"
  ) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }

  // Touch / Mouse drag fallback on canvas so desktop testing works too
  let isPointerDragging = false;
  function updateFromCanvasPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    pointerX = clamp01((clientX - rect.left) / rect.width);
    pointerY = clamp01((clientY - rect.top) / rect.height);
    if (!inActiveRound) {
      trailPoints.push([pointerX, pointerY]);
      if (trailPoints.length > MAX_TEST_TRAIL) trailPoints.shift();
      sampleCountEl.textContent = `${trailPoints.length} pts`;
    }
    updateDebugReadout();
  }

  canvas.addEventListener("pointerdown", (e) => {
    isPointerDragging = true;
    updateFromCanvasPointer(e);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (isPointerDragging) updateFromCanvasPointer(e);
  });
  window.addEventListener("pointerup", () => {
    isPointerDragging = false;
  });

  // --- Default Reference Circle for Foundation Sandbox ---
  const sandboxCircle = Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * Math.PI * 2;
    return [0.5 + 0.32 * Math.cos(angle), 0.5 + 0.32 * Math.sin(angle)];
  });

  // --- 60fps Canvas Render Loop ---
  function renderCanvas() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Subtle background grid & centre crosshair
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (i / 4) * w;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }

    // Centre crosshair ticks
    ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - 14, h * 0.5);
    ctx.lineTo(w * 0.5 + 14, h * 0.5);
    ctx.moveTo(w * 0.5, h * 0.5 - 14);
    ctx.lineTo(w * 0.5, h * 0.5 + 14);
    ctx.stroke();

    // 2. Guide shape (server targetPoints during round, or faint reference circle in sandbox)
    const guide = inActiveRound && targetPoints.length > 1 ? targetPoints : sandboxCircle;
    if (guide && guide.length > 1) {
      ctx.save();
      ctx.strokeStyle = inActiveRound
        ? "rgba(255, 255, 255, 0.45)"
        : "rgba(148, 163, 184, 0.2)";
      ctx.lineWidth = inActiveRound ? 6 : 3;
      ctx.setLineDash([10, 10]);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      guide.forEach((pt, idx) => {
        const gx = pt[0] * w;
        const gy = pt[1] * h;
        if (idx === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 3. Player's recorded path / test trail
    const activePath = inActiveRound ? roundPoints : trailPoints;
    if (activePath.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#00f0ff";
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < activePath.length; i++) {
        const px = activePath[i][0] * w;
        const py = activePath[i][1] * h;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Current live pointer dot
    const dotX = pointerX * w;
    const dotY = pointerY * h;

    ctx.save();
    // Outer pulse halo
    ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 20, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = "#00f0ff";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
    ctx.fill();

    // White centre pip
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    requestAnimationFrame(renderCanvas);
  }

  requestAnimationFrame(renderCanvas);

  // --- Socket.IO Integration (PLAN.md Contract) ---
  let socket = null;
  if (typeof window.io === "function") {
    socket = window.io();

    socket.on("connect", () => {
      socketPill.textContent = "Server: Connected";
      socketPill.className = "pill pill-ok";
    });

    socket.on("disconnect", () => {
      socketPill.textContent = "Server: Disconnected";
      socketPill.className = "pill pill-warn";
    });

    // lobby:update -> { players: [{ id, name }] }
    socket.on("lobby:update", (payload) => {
      const players = (payload && payload.players) || [];
      lobbyPlayers.innerHTML = "";
      players.forEach((p) => {
        const chip = document.createElement("span");
        chip.className = "player-chip";
        chip.textContent = p.name + (p.id === playerId ? " (You)" : "");
        lobbyPlayers.appendChild(chip);
      });
    });

    // round:start -> { round, shapeId, targetPoints: [[x,y]...], durationMs: 10000 }
    socket.on("round:start", (payload) => {
      startRound(payload);
    });

    // round:results -> { round, results: [{ playerId, name, score, accuracy, smoothness, points, comment }], winner: { playerId, name } }
    socket.on("round:results", (payload) => {
      showRoundResults(payload);
    });

    // game:end -> { leaderboard: [{ playerId, name, total }], stats: { ... } }
    socket.on("game:end", (payload) => {
      showGameEnd(payload);
    });
  }

  // Handle Join Form Submit -> emit player:join { code, name } -> ack { ok, playerId }
  joinForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = inputCode.value.trim().toUpperCase();
    const name = inputName.value.trim();

    if (code.length !== 4 || !name) {
      joinMsg.textContent = "Enter a 4-letter room code and your name.";
      return;
    }

    // Prompt motion permission automatically on join tap as a convenience on iOS
    if (!motionEnabled) {
      requestMotionPermission();
    }

    if (!socket || !socket.connected) {
      joinMsg.textContent = "Backend server not connected — use the Motion Test Canvas below!";
      return;
    }

    joinMsg.textContent = "Joining room...";
    socket.emit("player:join", { code, name }, (ack) => {
      if (!ack || !ack.ok) {
        joinMsg.textContent = (ack && ack.error) || "Could not join room. Check the 4-letter code.";
        return;
      }

      roomCode = code;
      playerName = name;
      playerId = ack.playerId;

      joinMsg.textContent = "";
      lobbyCode.textContent = roomCode;
      lobbyPlayerName.textContent = playerName;

      screenJoin.classList.add("hidden");
      screenResults.classList.add("hidden");
      screenGameover.classList.add("hidden");
      screenLobby.classList.remove("hidden");
    });
  });

  // Start a 10-second drawing round
  function startRound(payload) {
    if (sampleIntervalId) clearInterval(sampleIntervalId);
    if (countdownRafId) cancelAnimationFrame(countdownRafId);

    activeRoundNum = payload.round || 1;
    activeShapeId = payload.shapeId || "shape";
    targetPoints = Array.isArray(payload.targetPoints) ? payload.targetPoints : sandboxCircle;
    const durationMs = payload.durationMs || 10000;

    inActiveRound = true;
    roundPoints = [];
    trailPoints = [];

    // Auto-calibrate centre on round start per PLAN.md / TASKS.md
    recentrePointer();

    // Update UI screens
    screenJoin.classList.add("hidden");
    screenLobby.classList.add("hidden");
    screenResults.classList.add("hidden");
    screenGameover.classList.add("hidden");
    screenRoundBanner.classList.remove("hidden");

    roundLabel.textContent = `ROUND ${activeRoundNum}`;
    roundShapeName.textContent = activeShapeId.toUpperCase();
    canvasModeLabel.textContent = `TRACE THE ${activeShapeId.toUpperCase()}!`;

    // Sample pointer at ~30 Hz (every 33ms) normalised in 0..1
    sampleIntervalId = setInterval(() => {
      if (!inActiveRound) return;
      roundPoints.push([round4(pointerX), round4(pointerY)]);
      sampleCountEl.textContent = `${roundPoints.length} pts`;
    }, 33);

    roundEndTime = performance.now() + durationMs;

    function tickTimer() {
      const remainingMs = Math.max(0, roundEndTime - performance.now());
      roundTimer.textContent = `${(remainingMs / 1000).toFixed(1)}s`;
      if (remainingMs > 0 && inActiveRound) {
        countdownRafId = requestAnimationFrame(tickTimer);
      } else if (inActiveRound) {
        finishAndSubmitRound();
      }
    }

    countdownRafId = requestAnimationFrame(tickTimer);
  }

  function finishAndSubmitRound() {
    if (!inActiveRound) return;
    inActiveRound = false;
    if (sampleIntervalId) {
      clearInterval(sampleIntervalId);
      sampleIntervalId = null;
    }

    roundTimer.textContent = "0.0s";
    canvasModeLabel.textContent = "ROUND SUBMITTED — SCORING IN SNOWFLAKE...";

    if (socket && socket.connected && roomCode && playerId) {
      socket.emit("player:submit", {
        code: roomCode,
        playerId,
        round: activeRoundNum,
        points: roundPoints,
      });
    }
  }

  function showRoundResults(payload) {
    inActiveRound = false;
    if (sampleIntervalId) clearInterval(sampleIntervalId);

    screenRoundBanner.classList.add("hidden");
    screenResults.classList.remove("hidden");
    canvasModeLabel.textContent = "MOTION TEST CANVAS (YAW → X, PITCH → Y)";

    const round = payload.round || activeRoundNum;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const winner = payload.winner || (results[0] || { name: "---" });

    resultsTitle.textContent = `Round ${round} Results`;
    resultsWinnerBadge.textContent = `Winner: ${winner.name || "---"}`;

    const mine = results.find((r) => r.playerId === playerId) || results[0];
    if (mine) {
      myScoreVal.textContent = typeof mine.score === "number" ? Math.round(mine.score) : "--";
      myPointsEarned.textContent = `+${mine.points ?? 0} pts`;
      myAccVal.textContent = typeof mine.accuracy === "number" ? `${Math.round(mine.accuracy)}%` : "--";
      mySmoothVal.textContent = typeof mine.smoothness === "number" ? `${Math.round(mine.smoothness)}%` : "--";
      myAiComment.textContent = mine.comment ? `"${mine.comment}"` : `"Scored objectively by Snowflake!"`;
    }

    resultsList.innerHTML = "";
    results.forEach((r, idx) => {
      const row = document.createElement("div");
      row.className = "lb-row" + (r.playerId === playerId ? " is-me" : "");
      row.innerHTML = `
        <span><strong>#${idx + 1}</strong> ${escapeHtml(r.name || "Player")}</span>
        <span><strong>${Math.round(r.score || 0)}</strong> (+${r.points ?? 0})</span>
      `;
      resultsList.appendChild(row);
    });
  }

  function showGameEnd(payload) {
    inActiveRound = false;
    screenRoundBanner.classList.add("hidden");
    screenResults.classList.add("hidden");
    screenGameover.classList.remove("hidden");

    const leaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    finalLeaderboard.innerHTML = "";
    leaderboard.forEach((entry, idx) => {
      const row = document.createElement("div");
      row.className = "lb-row" + (entry.playerId === playerId ? " is-me" : "");
      row.innerHTML = `
        <span><strong>#${idx + 1}</strong> ${escapeHtml(entry.name || "Player")}</span>
        <span><strong>${entry.total ?? 0} pts</strong></span>
      `;
      finalLeaderboard.appendChild(row);
    });

    if (payload.stats && Object.keys(payload.stats).length > 0) {
      finalStats.classList.remove("hidden");
      finalStats.textContent = `Snowflake Stats: ${JSON.stringify(payload.stats)}`;
    }
  }

  btnPlayAgain.addEventListener("click", () => {
    screenGameover.classList.add("hidden");
    screenResults.classList.add("hidden");
    screenLobby.classList.add("hidden");
    screenJoin.classList.remove("hidden");
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }
})();
