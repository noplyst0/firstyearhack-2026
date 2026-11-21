const byId = id => document.getElementById(id);
const testGame = new URLSearchParams(location.search).get("test") === "1";
const storageKey = testGame ? "sky-test-host" : "sky-host";
const socket = window.io?.({ transports: ["websocket"] });
let room = sessionStorage.getItem(storageKey) || "";
let phase = "welcome", players = [], currentRound = 0;
let totalRounds = Number(sessionStorage.getItem(storageKey + "-rounds")) || 3;
let replayRequested = false;
let timer, startTimeout, snowflake = false;

function screen(active) {
  reveal.stop();
  clearInterval(timer);
  clearTimeout(startTimeout);
  startTimeout = null;
  phase = active;
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
  screen("round");
  currentRound = round;
  totalRounds = data.totalRounds || totalRounds;
  sessionStorage.setItem(storageKey + "-rounds", totalRounds);
  const name = data.shapeName || data.shapeId;
  const stars = "★".repeat(Math.max(0, Math.min(5, Number(data.difficulty) || 0)));
  byId("round-title").textContent = ["Round " + round + " of " + totalRounds, name, stars].filter(Boolean).join(" · ");
  byId("shape-label").textContent = name;
  const strokes = data.targetStrokes || [data.targetPoints];
  byId("target").setAttribute("d", strokes.map(s => s.map(([x,y], i) => (i ? "L" : "M") + x*100 + " " + y*100).join(" ")).join(" "));
  byId("target").classList.remove("poof");
  byId("memory").hidden = !memory;
  byId("memory").textContent = "✦ MEMORY ROUND · Memorise the shape";
  byId("progress").textContent = "0 / " + players.filter(p => !p.isBot).length + " drawings in";
  const key = storageKey + "-clock";
  const prior = JSON.parse(sessionStorage.getItem(key) || "null");
  const started = prior?.code === room && prior.round === round ? prior.started : Date.now();
  sessionStorage.setItem(key, JSON.stringify({ code:room, round, started }));
  const go = started + (data.countdownMs ?? 3000);
  let lastCue;
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
        byId("memory").textContent = "✦ MEMORY ROUND · Draw from memory";
      }
    }
    byId("time").textContent = before || now-go < 700 ? cue : Math.ceil(remaining/1000) + "s";
    byId("timer").value = Math.min(1, remaining/durationMs);
    if (remaining === 0) clearInterval(timer);
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
let result, featured, comments, percentiles;

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
  const rows = result.results.filter(p => !p.isBot).slice(0,10).map(p => {
    const row = document.createElement("li");
    const heading = document.createElement("div");
    heading.className = "rank-heading";
    heading.append(textNode("strong", (p.rank ? "#" + p.rank : "—") + "  " + p.name),
      textNode("b", p.valid ? percentage(p.score) : "No drawing"), textNode("span", "+" + p.roundPoints + " pts"));
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
socket?.on("round:results", data => {
  screen("results");
  currentRound = data.round;
  result = data;
  comments = {};
  percentiles = {};
  featured = null;
  byId("results").classList.remove("revealed");
  byId("rankings").hidden = true;
  byId("spotlight").classList.remove("winner");
  byId("result-title").textContent = "Round " + data.round + " · " + data.shapeName;
  byId("scorer").textContent = data.scorer === "snowflake" ? "Judged by Snowflake in " + (data.judgeMs/1000).toFixed(2) + " s" : "";
  byId("next").textContent = data.round === totalRounds ? "Final standings →" : "Next round →";
  byId("performer").textContent = "Drawing reveal";
  byId("quote").textContent = byId("score").textContent = "";
  const ghosts = data.results.filter(p => p.isBot);
  byId("ghost-summary").textContent = ghosts.length ? ghosts.length + " ghosts from earlier today · Best ghost " + percentage(Math.max(...ghosts.map(p => p.score))) : "";
  reveal.start(data, (p, count, won) => {
    featured = p;
    byId("spotlight").classList.toggle("winner",won);
    byId("performer").textContent = p ? (won ? "★ WINNER  " : "") + p.name : count + " drawings";
    byId("score").textContent = p && !p.valid ? "No drawing" : "";
    byId("quote").textContent = p ? quoteFor(p) : "";
  }, () => {
    if (!data.winner) {
      featured = null;
      byId("performer").textContent = "No winner this round";
      byId("score").textContent = byId("quote").textContent = "";
    }
    byId("rankings").hidden = false;
    byId("results").classList.add("revealed");
    showStandings();
  });
});
socket?.on("round:extras", data => {
  if (phase !== "results" || data.round !== currentRound) return;
  Object.assign(comments, data.comments);
  Object.assign(percentiles, data.percentiles);
  if (featured) byId("quote").textContent = quoteFor(featured);
  if (!byId("rankings").hidden) showStandings();
});
byId("next").onclick = () => send("host:next");
byId("again").onclick = () => {
  sounds.unlock();
  replayRequested = true;
  send("host:again");
};

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
  byId("podium").replaceChildren(...people.slice(0,3).map((p,i) => {
    const place = document.createElement("div");
    place.className = "place";
    place.append(textNode("small", ["★ Champion","2nd place","3rd place"][i]),textNode("strong",p.name),textNode("span",p.total + " pts"));
    return place;
  }));
  const local = stats.source === "local" || (!stats.source && !snowflake);
  byId("stats-title").textContent = local ? "This game" : "Snowflake stats";
  const values = [
    [local ? "Drawings" : "Drawings today", stats.totalAttempts],
    [local ? "Games" : "Games today", stats.totalGames],
    [local ? "Best score" : "Best ever", stats.bestEver == null ? null : percentage(stats.bestEver)],
    ["Hardest shape", stats.hardestShape], ["Most common accidental shape", stats.commonWrongGuess],
    ...(stats.avgByShape || []).map(s => [s.shape + " average", percentage(s.avg)])
  ];
  byId("stats").replaceChildren(...values.flatMap(([label,value]) => [textNode("dt",label),textNode("dd",value ?? "—")]));
});
