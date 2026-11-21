// SkySketch server: one Express + socket.io process.
// Phone page at /, host (big screen) page at /host, realtime events per PLAN.md contract.
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const R = require('./rooms');
const { loadShapes } = require('./shapes');

const PORT = process.env.PORT || 3000;
const ROUND_MS = 10000;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use('/host', express.static(path.join(FRONTEND, 'host')));
app.use('/', express.static(path.join(FRONTEND, 'phone')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: R.rooms.size }));

const shapes = loadShapes();

function ack(cb, payload) {
  if (typeof cb === 'function') cb(payload);
}

function emitLobby(room) {
  io.to(room.code).emit('lobby:update', R.lobbyPayload(room));
}

// Stub: every round is the circle for now. Real rounds and scoring come with the final plan.
function startRound(room) {
  room.round += 1;
  const payload = {
    round: room.round,
    shapeId: 'circle',
    targetPoints: shapes.circle,
    durationMs: ROUND_MS,
  };
  io.to(room.code).emit('round:start', payload);
  console.log(`[${room.code}] round ${room.round} started (${payload.shapeId})`);
}

io.on('connection', (socket) => {
  socket.on('host:create', (_data, cb) => {
    if (typeof _data === 'function') cb = _data; // allow emit('host:create', cb)
    const room = R.createRoom(socket.id);
    socket.join(room.code);
    socket.data.role = 'host';
    socket.data.code = room.code;
    console.log(`[${room.code}] created`);
    ack(cb, { code: room.code });
    emitLobby(room);
  });

  socket.on('player:join', (data, cb) => {
    const room = R.getRoom(data && data.code);
    const name = R.cleanName(data && data.name);
    if (!room) return ack(cb, { ok: false, error: 'Room not found' });
    if (!name) return ack(cb, { ok: false, error: 'Name required' });
    if (room.state !== 'lobby') return ack(cb, { ok: false, error: 'Game already started' });
    const live = R.lobbyPayload(room).players;
    if (live.length >= R.MAX_PLAYERS) return ack(cb, { ok: false, error: 'Room is full' });
    if (live.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return ack(cb, { ok: false, error: 'Name taken' });
    }
    const player = R.addPlayer(room, name, socket.id);
    socket.join(room.code);
    socket.data.role = 'player';
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    console.log(`[${room.code}] ${name} joined (${player.id})`);
    ack(cb, { ok: true, playerId: player.id });
    emitLobby(room);
  });

  socket.on('host:start', (data, cb) => {
    const room = R.getRoom(data && data.code);
    if (!room) return ack(cb, { ok: false, error: 'Room not found' });
    if (room.hostSocketId !== socket.id) return ack(cb, { ok: false, error: 'Only the host can start' });
    if (room.state !== 'lobby') return ack(cb, { ok: false, error: 'Already started' });
    if (R.lobbyPayload(room).players.length === 0) return ack(cb, { ok: false, error: 'No players yet' });
    const rounds = Number(data.rounds);
    room.rounds = Number.isInteger(rounds) && rounds > 0 && rounds <= 10 ? rounds : 3;
    room.state = 'playing';
    ack(cb, { ok: true });
    startRound(room);
  });

  socket.on('disconnect', () => {
    const room = R.getRoom(socket.data.code);
    if (!room) return;
    if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
      io.to(room.code).emit('room:closed', { reason: 'Host left' });
      R.deleteRoom(room.code);
      console.log(`[${room.code}] closed (host left)`);
      return;
    }
    const player = room.players.get(socket.data.playerId);
    if (!player) return;
    if (room.state === 'lobby') room.players.delete(player.id);
    else player.connected = false;
    emitLobby(room);
  });
});

server.listen(PORT, () => {
  console.log(`SkySketch on http://localhost:${PORT}  (phone: /  host: /host)`);
});
