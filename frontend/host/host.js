const byId = id => document.getElementById(id);
const testGame = new URLSearchParams(location.search).get("test") === "1";
const storageKey = testGame ? "sky-test-host" : "sky-host";
const socket = window.io?.({ transports: ["websocket"] });
let room = sessionStorage.getItem(storageKey) || "";
let phase = "welcome", players = [], currentRound = 0;
let totalRounds = Number(sessionStorage.getItem(storageKey + "-rounds")) || 3;
let replayRequested = false;
let timer, startTimeout, snowflake = false;
let podiumTimers = [];
function clearPodiumTimers() {
  for (const id of podiumTimers) clearTimeout(id);
  podiumTimers = [];
}

function screen(active) {
  reveal.stop();
  clearInterval(timer);
  clearTimeout(startTimeout);
  clearPodiumTimers();
  startTimeout = null;
  phase = active;
  document.body.classList.toggle("in-reveal", active === "drawing-reveal");
  document.body.classList.toggle("in-fullscreen", active === "room-view-screen");
  for (const section of document.querySelectorAll("main > section")) section.hidden = section.id !== active;
  byId("notice").textContent = "";
  window.scrollTo(0, 0);
}
function send(event, data = {}) {
  if (socket?.connected && room) socket.emit(event, { code: room, ...data });
}
async function checkHealth() {
  try {
    const response = await fetch("/health", { cache:"no-store", signal:AbortSignal.timeout(5000) });
    snowflake = response.ok && (await response.json()).snowflake === "ok";
  } catch { snowflake = false; }
  byId("health").textContent = snowflake ? "Snowflake ✓" : "Local mode";
}
checkHealth();
setInterval(checkHealth, 10000);

function lobbyControls() {
  byId("bots").disabled = !socket?.connected || players.filter(p => p.isBot).length >= 50;
  byId("start").disabled = !socket?.connected || !room || !players.length || Boolean(startTimeout);
}
function roster(list) {
  const prior = new Set(players.map(p => p.id));
  if (phase === "lobby" && list.some(p => !prior.has(p.id))) sounds.play("join");
  players = list;
  const chips = players.map(player => {
    const chip = document.createElement("li");
    chip.append((player.isBot ? "👻 " : "") + player.name);
    const kick = document.createElement("button");
    kick.className = "kick";
    kick.textContent = "×";
    kick.setAttribute("aria-label", "Remove " + player.name);
    let armedUntil = 0;
    kick.onclick = () => {
      if (Date.now() < armedUntil) return send("host:kick", { playerId:player.id });
      armedUntil = Date.now() + 3000;
      kick.textContent = "Confirm ×";
      setTimeout(() => { kick.textContent = "×"; }, 3000);
    };
    chip.append(kick);
    if (!prior.has(player.id)) chip.classList.add("new-chip");
    return chip;
  });
  byId("players").replaceChildren(...chips);
  byId("count").textContent = players.length;
  byId("empty").hidden = players.length > 0;
  lobbyControls();
}
function joinLink() {
  if (!room) return;
  const url = new URL("/", location.href);
  url.searchParams.set("code", room);
  byId("code").textContent = room;
  byId("phone").href = url.href;
  byId("phone").textContent = url.href;
  const qr = byId("qr");
  if (window.QRCode && qr.dataset.url !== url.href) {
    qr.replaceChildren();
    new QRCode(qr, { text:url.href, width:320, height:320 });
    qr.dataset.url = url.href;
    qr.hidden = false;
  }
}
byId("qr-library").addEventListener("load", joinLink);
function createRoom(reclaim) {
  byId("create").disabled = true;
  byId("notice").textContent = reclaim ? "Rejoining room…" : "Creating room…";
  const payload = reclaim ? { code:room } : testGame ? { test:true } : {};
  socket.timeout(8000).emit("host:create", payload, (error, reply) => {
    if (!socket.connected) return;
    if (error || !reply?.code) {
      if (!error) { sessionStorage.removeItem(storageKey); room = ""; }
      screen("welcome");
      byId("create").textContent = room ? "Retry connection" : "Create room ↗";
      byId("create").disabled = false;
      byId("notice").textContent = "Couldn’t open the room. Try again.";
      return;
    }
    room = reply.code;
    sessionStorage.setItem(storageKey, room);
    joinLink();
    // A reclaim also replays the current event, either side of the ack.
    if (!reclaim || reply.state === "LOBBY" || phase === "welcome") screen("lobby");
    lobbyControls();
  });
}
byId("create").onclick = () => { sounds.unlock(); createRoom(Boolean(room)); };
byId("bots").onclick = () => send("host:bots", { count:20 });
byId("start").onclick = () => {
  sounds.unlock();
  totalRounds = Number(byId("rounds").value);
  sessionStorage.removeItem(storageKey + "-clock");
  startTimeout = setTimeout(() => {
    startTimeout = null;
    lobbyControls();
    byId("notice").textContent = "Still waiting for the server. Try again.";
  }, 8000);
  lobbyControls();
  send("host:start", { rounds:totalRounds });
};
function startRound(data) {
  const { round, durationMs, memory } = data;
  const isPractice = Boolean(data.practice || round === 0);
  screen("round");
  currentRound = round;
  totalRounds = data.totalRounds || totalRounds;
  sessionStorage.setItem(storageKey + "-rounds", totalRounds);
  const name = data.shapeName || data.shapeId;
  const stars = "★".repeat(Math.max(0, Math.min(5, Number(data.difficulty) || 0)));
  const roundLabel = isPractice ? "Practice round" : "Round " + round + " of " + totalRounds;
  byId("round-title").textContent = [roundLabel, name, stars].filter(Boolean).join(" · ");
  byId("shape-label").textContent = name;
  const rawStrokes = Array.isArray(data.targetStrokes) && data.targetStrokes.length
    ? data.targetStrokes
    : data.targetPoints ? [data.targetPoints] : [];
  const strokes = rawStrokes.filter(s => Array.isArray(s) && s.length);
  byId("target").setAttribute("d", strokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + x*100 + " " + y*100).join(" ")).join(" "));
  byId("target").classList.remove("poof");
  byId("round").classList.remove("urgent");
  byId("practice").hidden = !isPractice;
  byId("memory").hidden = !memory;
  byId("memory").textContent = "✦ MEMORY ROUND · Memorise the shape";
  byId("progress").textContent = "0 / " + players.filter(p => !p.isBot).length + " drawings in";
  const key = storageKey + "-clock";
  const prior = JSON.parse(sessionStorage.getItem(key) || "null");
  const started = prior?.code === room && prior.round === round ? prior.started : Date.now();
  sessionStorage.setItem(key, JSON.stringify({ code:room, round, started, stars }));
  const go = started + (data.countdownMs ?? 3000);
  let lastCue, lastUrgentSec = null;
  function tick() {
    const now = Date.now();
    const remaining = Math.max(0, go + durationMs - now);
    const before = now < go;
    const cue = before ? String(Math.ceil((go-now)/1000)) : "GO!";
    if (cue !== lastCue) {
      if (before || now-go < 800) sounds.play(before ? "beep" : "go");
      lastCue = cue;
      if (!before && memory) {
        byId("target").classList.add("poof");
        byId("round-title").textContent = roundLabel;
        byId("shape-label").textContent = "Hidden memory target";
        byId("memory").textContent = "✦ MEMORY ROUND · Draw from memory";
      }
    }
    const urgent = !before && remaining > 0 && remaining <= 3000;
    byId("round").classList.toggle("urgent", urgent);
    if (urgent) {
      const secLeft = Math.ceil(remaining / 1000);
      if (secLeft !== lastUrgentSec) {
        lastUrgentSec = secLeft;
        sounds.play("tick");
      }
    }
    byId("time").textContent = before || now-go < 700 ? cue : Math.ceil(remaining/1000) + "s";
    byId("timer").value = Math.min(1, remaining/durationMs);
    if (remaining === 0) {
      sounds.play("buzzer");
      clearInterval(timer);
    }
  }
  timer = setInterval(tick, 75);
  tick();
}
socket?.on("round:start", startRound);
socket?.on("round:progress", ({ round, submitted, total }) => {
  if (phase === "round" && currentRound === round) byId("progress").textContent = submitted + " / " + total + " drawings in";
});
socket?.on("round:judging", ({ round, distanceChecks }) => {
  screen("judging");
  currentRound = round;
  byId("judge-title").textContent = snowflake ? "Snowflake is judging…" : "Judging drawings…";
  const start = performance.now();
  function tick() {
    const fraction = Math.min(1, (performance.now()-start)/800);
    byId("checks").textContent = Math.round(fraction * distanceChecks).toLocaleString() + " distance checks";
    if (fraction === 1) clearInterval(timer);
  }
  timer = setInterval(tick, 40);
  tick();
});
socket?.on("lobby:update", ({ players }) => {
  if (phase === "final" && replayRequested) {
    replayRequested = false;
    sessionStorage.removeItem(storageKey + "-clock");
    screen("lobby");
  }
  roster(players);
});
socket?.on("connect", () => {
  byId("connection").textContent = "Connected";
  byId("create").disabled = false;
  if (room) createRoom(true);
});
socket?.on("disconnect", () => {
  clearTimeout(startTimeout);
  startTimeout = null;
  byId("connection").textContent = "Reconnecting…";
  byId("create").disabled = true;
  lobbyControls();
});
socket?.on("connect_error", () => { byId("connection").textContent = "Connecting…"; });
if (!socket) byId("connection").textContent = "Open /host on the game server";

function textNode(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}
const percentage = value => Number(value).toFixed(1) + "%";
let result, featured, comments, percentiles, roomViewData;

function roomViewHeadline() {
  const validReal = (result?.results || []).filter(p => !p.isBot && p.valid);
  const computedAlone = validReal.length
    ? validReal.reduce((sum, p) => sum + Number(p.score || 0), 0) / validReal.length
    : null;
  const alone = roomViewData?.alone != null && Number.isFinite(Number(roomViewData.alone))
    ? Number(roomViewData.alone)
    : computedAlone;
  const together = roomViewData?.crowd?.score != null && Number.isFinite(Number(roomViewData.crowd.score))
    ? Number(roomViewData.crowd.score)
    : null;

  const parts = [];
  if (alone != null) parts.push("Alone " + percentage(alone));
  if (together != null) parts.push("Together " + percentage(together));
  let headline = parts.join("  ·  ");
  if (alone != null && together != null && together > alone + 0.5) {
    headline += "  (+" + (together - alone).toFixed(1) + "%!)";
  }
  return headline || "Collective accuracy heatmap";
}

function updateRoomViewUI() {
  const btn = byId("room-view-btn");
  const teaser = byId("room-view-teaser");
  const hasData = Boolean(roomViewData && (roomViewData.heat?.length || roomViewData.crowd?.path?.length));
  btn.hidden = !hasData;
  teaser.hidden = !hasData;
  if (!hasData) {
    if (phase === "room-view-screen") screen("results");
    return;
  }

  const headline = roomViewHeadline();
  byId("room-view-teaser-stats").textContent = headline;
  byId("room-view-headline").textContent = headline;
  byId("room-view-verdict").textContent = roomViewData.verdict || "";
  const isPractice = Boolean(result?.practice || result?.round === 0);
  const roundLabel = isPractice ? "Practice round" : "Round " + result?.round;
  byId("room-view-shape").textContent = [roundLabel, result?.shapeName].filter(Boolean).join(" · ");
  byId("room-view-next").textContent = byId("next").textContent;
  reveal.renderRoomView(byId("room-view-svg"), result, roomViewData);
}

function openRoomView() {
  if (!roomViewData || !(roomViewData.heat?.length || roomViewData.crowd?.path?.length)) return;
  screen("room-view-screen");
  updateRoomViewUI();
}
function closeRoomView() {
  if (phase !== "room-view-screen") return;
  screen("results");
  showStandings();
  updateRoomViewUI();
}
byId("room-view-btn").onclick = openRoomView;
byId("room-view-open").onclick = e => { e.stopPropagation(); openRoomView(); };
byId("room-view-teaser").onclick = openRoomView;
byId("room-view-back").onclick = closeRoomView;
byId("room-view-next").onclick = () => send("host:next");
window.addEventListener("keydown", e => {
  if (e.key === "Escape" && phase === "room-view-screen") closeRoomView();
});

function quoteFor(p) {
  return comments[p.playerId] ?? p.comment ?? "…";
}
function meter(label, value) {
  const wrapper = document.createElement("label");
  wrapper.append(label + " " + Math.round(value) + "%");
  const bar = document.createElement("meter");
  bar.max = 100;
  bar.value = value;
  wrapper.append(bar);
  return wrapper;
}
function showStandings() {
  const isPractice = Boolean(result?.practice || result?.round === 0);
  const rows = result.results.filter(p => !p.isBot).slice(0,10).map(p => {
    const row = document.createElement("li");
    const heading = document.createElement("div");
    heading.className = "rank-heading";
    heading.append(textNode("strong", (p.rank ? "#" + p.rank : "—") + "  " + p.name),
      textNode("b", p.valid ? percentage(p.score) : "No drawing"),
      textNode("span", isPractice ? "Practice" : "+" + p.roundPoints + " pts"));
    row.append(heading);
    if (p.valid) {
      const meters = document.createElement("div");
      meters.className = "meters";
      meters.append(meter("On the line",p.onLine), meter("Covered",p.coverage));
      row.append(meters);
    }
    if (p.guess) {
      const prefix = result.scorer === "snowflake" ? "Snowflake thinks you drew " : "Looks like ";
      row.append(textNode("small", prefix + p.guess.label));
    }
    const percentile = percentiles[p.playerId];
    if (percentile) row.append(textNode("small", "Beat " + percentile.beatPct + "% of " + percentile.pool + " attempts"));
    row.append(textNode("small", quoteFor(p)));
    return row;
  });
  byId("rank-list").replaceChildren(...rows);
  if (featured) byId("quote").textContent = quoteFor(featured);
}
function guessInfo(p, res = result) {
  if (!p?.valid || !p?.guess?.label) return null;
  const matched = String(p.guess.shapeId) === String(res?.shapeId);
  const sf = res?.scorer === "snowflake";
  const text = matched
    ? (sf ? "❄ Snowflake recognised your " : "✓ Recognised as ") + (res?.shapeName || p.guess.label)
    : (sf ? "❄ Snowflake thinks you drew " : "Looks like ") + p.guess.label;
  return { text, matched };
}
function updateSpotlightGuess(p) {
  const pill = byId("guess-pill");
  if (!pill) return;
  const info = guessInfo(p);
  if (!info) {
    pill.hidden = true;
    pill.textContent = "";
    pill.classList.remove("matched");
    return;
  }
  pill.textContent = info.text;
  pill.classList.toggle("matched", info.matched);
  pill.hidden = false;
}
function formatBestEver(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v.score == null || !Number.isFinite(Number(v.score))) return null;
    const parts = [percentage(v.score)];
    if (v.name) parts.push(v.name);
    if (v.shape) parts.push("(" + v.shape + ")");
    return parts.join(" · ").replace(" · (", " (");
  }
  return Number.isFinite(Number(v)) ? percentage(v) : null;
}
socket?.on("round:results", data => {
  screen("drawing-reveal");
  currentRound = data.round;
  result = data;
  const isPractice = Boolean(data.practice || data.round === 0);
  comments = {};
  percentiles = {};
  roomViewData = null;
  featured = null;
  byId("spotlight").classList.remove("winner");
  byId("spotlight").hidden = true;
  updateSpotlightGuess(null);
  updateRoomViewUI();
  const clock = JSON.parse(sessionStorage.getItem(storageKey + "-clock") || "null");
  const stars = clock?.code === room && clock.round === data.round ? clock.stars : "";
  const roundLabel = isPractice ? "Practice round" : "Round " + data.round;
  byId("result-title").textContent = [roundLabel, data.shapeName, stars].filter(Boolean).join(" · ");
  byId("practice-results-note").hidden = !isPractice;
  byId("scorer").textContent = data.scorer === "snowflake" ? "Judged by Snowflake in " + (data.judgeMs/1000).toFixed(2) + " s" : "";
  byId("next").textContent = isPractice ? "Start Round 1 →" : data.round === totalRounds ? "Final standings →" : "Next round →";
  byId("performer").textContent = "Drawing reveal";
  byId("quote").textContent = byId("score").textContent = "";
  const ghosts = data.results.filter(p => p.isBot);
  byId("ghost-summary").textContent = ghosts.length ? ghosts.length + " ghosts from earlier today · Best ghost " + percentage(Math.max(...ghosts.map(p => p.score))) : "";
  reveal.start(data, (p, count, won) => {
    featured = p;
    const isPendingWinner = Boolean(p && data.winner && p.playerId === data.winner.playerId && !won);
    byId("spotlight").hidden = isPendingWinner;
    byId("spotlight").classList.toggle("winner", won);
    const winTag = isPractice ? "★ PRACTICE WINNER  " : "★ WINNER  ";
    byId("performer").textContent = p ? (won ? winTag : "") + p.name : count + " drawings";
    byId("score").textContent = won ? percentage(p.score) : p && !p.valid ? "No drawing" : "";
    updateSpotlightGuess(isPendingWinner ? null : p);
    byId("quote").textContent = p && !isPendingWinner ? quoteFor(p) : "";
  }, () => {
    if (!data.winner) {
      featured = null;
      byId("performer").textContent = "No winner this round";
      byId("score").textContent = byId("quote").textContent = "";
      updateSpotlightGuess(null);
    }
    screen("results");
    showStandings();
    updateRoomViewUI();
  });
});
socket?.on("round:extras", data => {
  if (!["drawing-reveal","results","room-view-screen"].includes(phase) || data.round !== currentRound) return;
  if (data.comments) Object.assign(comments, data.comments);
  if (data.percentiles) Object.assign(percentiles, data.percentiles);
  if (data.heat || data.crowd || data.alone != null || data.verdict) {
    roomViewData = {
      ...(roomViewData || {}),
      ...(data.heat ? { heat: data.heat } : {}),
      ...(data.crowd ? { crowd: data.crowd } : {}),
      ...(data.alone != null ? { alone: data.alone } : {}),
      ...(data.verdict ? { verdict: data.verdict } : {}),
    };
  }
  if (featured && !byId("spotlight").hidden) byId("quote").textContent = quoteFor(featured);
  if (phase === "results" || phase === "room-view-screen") {
    showStandings();
    updateRoomViewUI();
  }
});
byId("next").onclick = () => send("host:next");
byId("again").onclick = () => {
  sounds.unlock();
  replayRequested = true;
  send("host:again");
};

const confettiPalette = ["#6ef3ff","#ff9bbf","#acff83","#bba7ff","#ffab74","#ffd65b","#e8ff64","#fa92fe"];
function burstConfetti(container, count = 60) {
  if (!container) return;
  container.replaceChildren(...Array.from({ length: count }, (_, i) => {
    const bit = document.createElement("i");
    bit.style.left = ((i * 29 + 7) % 100) + "%";
    bit.style.background = confettiPalette[i % confettiPalette.length];
    bit.style.animationDelay = ((i % 10) * 0.065) + "s";
    return bit;
  }));
}
function makePodiumCard(p, rank, onlyOne) {
  const place = document.createElement("div");
  const cls = rank === 1 ? "place--1st" : rank === 2 ? "place--2nd" : "place--3rd";
  place.className = "place " + cls + (onlyOne ? " place--only" : "");
  const medal = textNode("small", rank === 1 ? "👑 ★ Champion" : rank === 2 ? "🥈 2nd place" : "🥉 3rd place");
  medal.className = "medal";
  const name = textNode("strong", p.name);
  const pts = textNode("span", p.total + " pts");
  pts.className = "pts";
  place.append(medal, name, pts);
  return place;
}
function runKahootPodium(people) {
  clearPodiumTimers();
  const podium = byId("podium");
  const banner = byId("podium-banner");
  const confetti = byId("final-confetti");
  const grid = byId("final-grid");
  const skipBtn = byId("skip-podium");
  confetti.replaceChildren();
  banner.classList.remove("suspense");

  if (!people.length) {
    podium.replaceChildren();
    banner.textContent = "Thanks for playing!";
    grid.hidden = false;
    skipBtn.hidden = true;
    return;
  }

  const onlyOne = people.length === 1;
  const slots = [];
  const card1 = makePodiumCard(people[0], 1, onlyOne);
  const card2 = people[1] ? makePodiumCard(people[1], 2, false) : null;
  const card3 = people[2] ? makePodiumCard(people[2], 3, false) : null;
  if (card2) slots.push(card2);
  slots.push(card1);
  if (card3) slots.push(card3);
  podium.replaceChildren(...slots);

  const revealAllNow = () => {
    clearPodiumTimers();
    banner.classList.remove("suspense");
    card1.classList.remove("suspense");
    card1.replaceChildren(...makePodiumCard(people[0], 1, onlyOne).childNodes);
    for (const c of slots) c.classList.add("revealed");
    banner.textContent = "👑 " + people[0].name.toUpperCase() + " WINS!";
    grid.hidden = false;
    skipBtn.hidden = true;
  };
  skipBtn.onclick = revealAllNow;

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    revealAllNow();
    return;
  }

  grid.hidden = true;
  skipBtn.hidden = false;
  banner.textContent = "✦ FINAL PODIUM ✦";

  let t = 550;
  const schedule = (delay, fn) => { podiumTimers.push(setTimeout(fn, delay)); };

  if (card3) {
    schedule(t, () => {
      banner.textContent = "🥉 3RD PLACE… " + people[2].name + "!";
      card3.classList.add("revealed");
      sounds.play("podium");
    });
    t += 1550;
  }
  if (card2) {
    schedule(t, () => {
      banner.textContent = "🥈 2ND PLACE… " + people[1].name + "!";
      card2.classList.add("revealed");
      sounds.play("podium2");
    });
    t += 1600;
  }

  // Drum roll + suspense before revealing #1
  schedule(t, () => {
    banner.textContent = "🥁 AND THE CHAMPION IS…";
    banner.classList.add("suspense");
    card1.replaceChildren(textNode("small", "★ 1ST PLACE"), textNode("strong", "???"), textNode("span", "…"));
    card1.classList.add("suspense");
    sounds.play("drumroll");
  });
  t += 1850;

  // Winner burst + confetti
  schedule(t, () => {
    banner.classList.remove("suspense");
    card1.classList.remove("suspense");
    card1.replaceChildren(...makePodiumCard(people[0], 1, onlyOne).childNodes);
    card1.classList.add("revealed");
    banner.textContent = "👑 " + people[0].name.toUpperCase() + " WINS!";
    sounds.play("fanfare");
    burstConfetti(confetti, 64);
  });
  t += 1100;

  // Show full leaderboard & Snowflake stats panel
  schedule(t, () => {
    grid.hidden = false;
    skipBtn.hidden = true;
  });
}

function makeAwardChip(label, value, tone) {
  const chip = document.createElement("div");
  chip.className = "award-chip " + tone;
  chip.append(textNode("small", label), textNode("strong", value));
  return chip;
}
function formatConfusion(c) {
  if (!c || !c.shape || !c.label) return null;
  const pct = c.pct != null && Number.isFinite(Number(c.pct)) ? Math.round(Number(c.pct)) + "% of " : "";
  const plural = /s$/i.test(c.shape) ? c.shape : c.shape + "s";
  return pct + plural + " looked like " + c.label;
}
function renderAdvancedStats(stats = {}) {
  const local = stats.source === "local" || (!stats.source && !snowflake);
  byId("stats-title").textContent = local ? "This game" : "❄ Snowflake analytics";

  const awards = [];
  const bestText = formatBestEver(stats.bestEver);
  if (bestText) awards.push(makeAwardChip(local ? "🏆 Best drawing" : "🏆 Best ever", bestText, "award-gold"));

  if (stats.steadiest && stats.steadiest.name) {
    const tremor = stats.steadiest.tremor != null && Number.isFinite(Number(stats.steadiest.tremor))
      ? " · tremor " + Number(stats.steadiest.tremor).toFixed(2)
      : "";
    awards.push(makeAwardChip("🩺 Steadiest hands", stats.steadiest.name + tremor, "award-acid"));
  }
  if (stats.mostImproved && stats.mostImproved.name && Number.isFinite(Number(stats.mostImproved.gain))) {
    const gain = Number(stats.mostImproved.gain);
    const sign = gain >= 0 ? "+" : "";
    awards.push(makeAwardChip("📈 Most improved", stats.mostImproved.name + " (" + sign + gain.toFixed(1) + "%)", "award-lilac"));
  }
  const confText = formatConfusion(stats.confusion);
  if (confText) {
    awards.push(makeAwardChip("❄ Top confusion", confText, "award-pink"));
  } else if (stats.commonWrongGuess) {
    awards.push(makeAwardChip("❄ Most accidental shape", stats.commonWrongGuess, "award-pink"));
  }
  byId("stats-awards").replaceChildren(...awards);

  const shapeList = Array.isArray(stats.perShape) && stats.perShape.length
    ? stats.perShape
    : Array.isArray(stats.avgByShape) ? stats.avgByShape : [];
  const shapeRows = shapeList.filter(s => s && s.shape && Number.isFinite(Number(s.avg))).map(s => {
    const wrap = document.createElement("div");
    wrap.className = "shape-bar-row";
    const head = document.createElement("div");
    head.className = "shape-bar-head";
    const left = document.createElement("span");
    left.textContent = s.shape + (s.n != null ? " (" + s.n + ")" : "");
    if (stats.hardestShape && String(s.shape).toLowerCase() === String(stats.hardestShape).toLowerCase()) {
      const tag = textNode("span", "Hardest");
      tag.className = "hardest-tag";
      left.append(tag);
    }
    head.append(left, textNode("strong", percentage(s.avg)));
    const bar = document.createElement("meter");
    bar.max = 100;
    bar.value = Math.max(0, Math.min(100, Number(s.avg)));
    wrap.append(head, bar);
    return wrap;
  });
  byId("stats-shapes").replaceChildren(...shapeRows);

  const values = [
    [local ? "Drawings" : "Drawings today", stats.totalAttempts != null ? Number(stats.totalAttempts).toLocaleString() : null],
    [local ? "Games" : "Games today", stats.totalGames != null ? Number(stats.totalGames).toLocaleString() : null],
    ["Hardest shape", stats.hardestShape],
  ];
  if (!bestText) values.push([local ? "Best score" : "Best ever", "—"]);
  byId("stats").replaceChildren(...values.flatMap(([label, value]) => [textNode("dt", label), textNode("dd", value ?? "—")]));
}

socket?.on("game:end", ({ leaderboard, stats = {} }) => {
  screen("final");
  replayRequested = false;
  const people = leaderboard.filter(p => !p.isBot);
  function placing(p,i) {
    const row = document.createElement("li");
    row.append(textNode("strong", "#" + (i+1) + "  " + p.name), textNode("span", p.total + " pts"));
    return row;
  }
  byId("leaders").replaceChildren(...people.map(placing));
  runKahootPodium(people);
  renderAdvancedStats(stats);
});
