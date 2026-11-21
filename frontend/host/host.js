const byId = id => document.getElementById(id);
const phoneURL = new URL("/", location.href);
const socket = window.io?.();
let room = "";
let countdown;
let startTimeout;
let starting = false;
let playerCount = 0;

function screen(active) {
  for (const id of ["welcome", "lobby", "round"]) byId(id).hidden = id !== active;
}

function note(message) {
  byId("notice").textContent = message;
}

function refreshStart() {
  byId("start").disabled = !room || !playerCount || starting;
  byId("start").textContent = starting ? "Starting…" : "Start game →";
}

function renderPlayers(players) {
  const names = players.map(player => {
    const item = document.createElement("li");
    item.textContent = player.name;
    return item;
  });
  byId("players").replaceChildren(...names);
  playerCount = names.length;
  byId("count").textContent = playerCount;
  byId("empty").hidden = playerCount > 0;
  refreshStart();
}

function drawQR() {
  const qr = byId("qr");
  if (!room || !window.QRCode || qr.childElementCount) return;
  new QRCode(qr, { text: phoneURL.href, width: 320, height: 320 });
  qr.hidden = false;
}

byId("qr-library").addEventListener("load", drawQR);
byId("phone").href = phoneURL.href;
byId("phone").textContent = phoneURL.host;

byId("create").onclick = () => {
  byId("create").disabled = true;
  note("Creating room…");
  socket.timeout(8000).emit("host:create", {}, (error, reply) => {
    if (!socket.connected) return;
    if (error || !reply?.code) {
      byId("create").disabled = false;
      note("Room creation failed. Try again.");
      return;
    }
    room = reply.code;
    byId("code").textContent = room;
    refreshStart();
    note("");
    screen("lobby");
    drawQR();
  });
};

byId("start").onclick = () => {
  starting = true;
  refreshStart();
  note("");
  startTimeout = setTimeout(() => {
    starting = false;
    refreshStart();
    note("The server hasn’t started the round. Try again.");
  }, 8000);
  socket.emit("host:start", { code: room, rounds: 3 });
};

socket?.on("round:start", ({ round, shapeId, targetPoints, durationMs }) => {
  clearInterval(countdown);
  clearTimeout(startTimeout);
  starting = false;
  note("");
  byId("target").setAttribute("points", targetPoints.map(([x, y]) => [100*x, 100*y].join(",")).join(" "));
  byId("shape-label").textContent = shapeId;
  byId("round-title").textContent = "Round " + round + " · " + shapeId;
  screen("round");
  const end = performance.now() + durationMs;
  function tick() {
    const seconds = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    byId("time").textContent = seconds + "s";
    if (seconds === 0) {
      clearInterval(countdown);
      note("Time’s up!");
    }
  }
  countdown = setInterval(tick, 100);
  tick();
});

socket?.on("lobby:update", ({ players }) => renderPlayers(players));
socket?.on("connect", () => {
  byId("connection").textContent = "Connected";
  byId("create").disabled = false;
});
socket?.on("disconnect", () => {
  clearInterval(countdown);
  clearTimeout(startTimeout);
  starting = false;
  room = "";
  renderPlayers([]);
  screen("welcome");
  byId("connection").textContent = "Reconnecting…";
  byId("create").disabled = true;
  note("Connection lost. Create a new room once reconnected.");
});
socket?.on("connect_error", () => { byId("connection").textContent = "Connecting to server…"; });
if (!socket) {
  byId("connection").textContent = "Server unavailable";
  note("Open this screen through the game server at /host, then refresh.");
}
