import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameRoom, CFG } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => {
  let players = 0;
  for (const r of rooms.values()) players += r.players.size;
  res.json({ ok: true, rooms: rooms.size, players });
});

// code -> GameRoom
const rooms = new Map();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sanitizeCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  } while (rooms.has(code));
  return code;
}

function joinRoom(socket, name, rawCode, create) {
  if (socket.data.code) {
    socket.emit('errorMsg', 'You are already in a room.');
    return;
  }

  let room;
  if (create) {
    const code = genCode();
    room = new GameRoom(io, code);
    rooms.set(code, room);
  } else {
    const code = sanitizeCode(rawCode);
    room = rooms.get(code);
    if (!room) {
      socket.emit('noRoom', { code });
      return;
    }
  }

  if (room.players.size >= CFG.MAX_PLAYERS) {
    if (create) rooms.delete(room.code);
    socket.emit('full');
    return;
  }

  socket.data.code = room.code;
  socket.join(room.code);
  const player = room.addPlayer(socket, name);

  socket.emit('init', {
    selfId: socket.id,
    code: room.code,
    status: room.status,
    floor: room.floor,
    players: room.playerList(),
  });
  room.emit('chat', { system: true, text: `${player.name} checked in.` });
  room.emit('players', room.playerList());
}

function roomOf(socket) {
  return rooms.get(socket.data.code);
}

io.on('connection', (socket) => {
  socket.emit('hello', { id: socket.id, cfg: CFG });

  socket.on('create', (name) => joinRoom(socket, name, '', true));
  socket.on('join', (msg) => {
    const name = msg && msg.name;
    const code = msg && msg.code;
    joinRoom(socket, name, code, false);
  });

  socket.on('start', () => {
    const room = roomOf(socket);
    if (room && room.players.size >= 1) room.start();
  });

  socket.on('restart', () => {
    const room = roomOf(socket);
    if (!room) return;
    room.reset();
    room.emit('gameState', { status: 'lobby', floor: room.floor });
    room.emit('players', room.playerList());
  });

  socket.on('state', (s) => roomOf(socket)?.updatePlayerState(socket.id, s || {}));
  socket.on('interact', (m) => roomOf(socket)?.interact(socket.id, m || {}));
  socket.on('pickupKey', (m) => roomOf(socket)?.pickupKey(socket.id, m || {}));
  socket.on('revive', (m) => roomOf(socket)?.revive(socket.id, m || {}));
  socket.on('hurt', (m) => roomOf(socket)?.damage(socket.id, (m && m.amount) || 0, (m && m.source) || 'unknown'));

  socket.on('chat', (text) => {
    const room = roomOf(socket);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p || typeof text !== 'string') return;
    room.emit('chat', { id: socket.id, name: p.name, text: text.slice(0, 120) });
  });

  socket.on('disconnect', () => {
    const room = roomOf(socket);
    if (!room) return;
    const p = room.players.get(socket.id);
    room.removePlayer(socket.id);
    if (p) room.emit('chat', { system: true, text: `${p.name} checked out.` });
    room.emit('players', room.playerList());
    if (room.players.size === 0) {
      room.stopTicking();
      rooms.delete(room.code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[DOORS: Hotel] listening on http://localhost:${PORT}`);
});
