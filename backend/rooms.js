// In-memory rooms. One room per host screen, keyed by a 4-letter code.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
const MAX_PLAYERS = 12;
const MAX_NAME = 16;

const rooms = new Map();

function newCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('no free room codes');
}

function createRoom(hostSocketId) {
  const code = newCode();
  const room = {
    code,
    hostSocketId,
    state: 'lobby', // lobby | playing | ended
    players: new Map(), // playerId -> { id, name, socketId, connected }
    rounds: 3,
    round: 0,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  if (typeof code !== 'string') return null;
  return rooms.get(code.trim().toUpperCase()) || null;
}

function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

function addPlayer(room, name, socketId) {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  const player = { id, name, socketId, connected: true };
  room.players.set(id, player);
  return player;
}

function lobbyPayload(room) {
  return {
    players: [...room.players.values()].filter((p) => p.connected).map((p) => ({ id: p.id, name: p.name })),
  };
}

function deleteRoom(code) {
  rooms.delete(code);
}

module.exports = { rooms, createRoom, getRoom, cleanName, addPlayer, lobbyPayload, deleteRoom, MAX_PLAYERS };
