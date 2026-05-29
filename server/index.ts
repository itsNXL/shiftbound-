import express      from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';

const PORT = Number(process.env.PORT ?? 3001);

const app  = express();
const http = createServer(app);
const io   = new Server(http, { cors: { origin: '*' } });

// Serve built client (production)
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

// ── Room state ─────────────────────────────────────────────────────────────

interface RoomPlayer { slot: number; }
interface Room {
  players: Map<string, RoomPlayer>;
  levelId: number;
  started: boolean;
}

const rooms = new Map<string, Room>();

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function nextFreeSlot(room: Room): number {
  const used = new Set([...room.players.values()].map(p => p.slot));
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return -1;
}

// ── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  let roomCode = '';
  let mySlot   = -1;

  // ── Create room ───────────────────────────────────────────────────────────
  socket.on('room:create',
    (data: { levelId: number }, cb: (r: { code: string; slot: number }) => void) => {
      const code = genCode();
      rooms.set(code, {
        players: new Map([[socket.id, { slot: 0 }]]),
        levelId: data.levelId,
        started: false,
      });
      roomCode = code;
      mySlot   = 0;
      socket.join(code);
      cb({ code, slot: 0 });
      console.log(`[${code}] created by ${socket.id.slice(0, 6)}`);
    },
  );

  // ── Join room ─────────────────────────────────────────────────────────────
  socket.on('room:join',
    (data: { code: string },
     cb: (r: { ok: boolean; slot?: number; players?: { slot: number }[]; levelId?: number; msg?: string }) => void) => {
      const code = data.code.toUpperCase();
      const room = rooms.get(code);
      if (!room)         { cb({ ok: false, msg: 'Room not found' }); return; }
      if (room.started)  { cb({ ok: false, msg: 'Game already started' }); return; }
      const slot = nextFreeSlot(room);
      if (slot < 0)      { cb({ ok: false, msg: 'Room is full' }); return; }

      room.players.set(socket.id, { slot });
      roomCode = code;
      mySlot   = slot;
      socket.join(code);

      // Notify existing members
      socket.to(code).emit('player:joined', { slot, total: room.players.size });

      const players = [...room.players.values()].map(p => ({ slot: p.slot }));
      cb({ ok: true, slot, players, levelId: room.levelId });
      console.log(`[${code}] player ${slot} joined (total ${room.players.size})`);
    },
  );

  // ── Host changes level before start ──────────────────────────────────────
  socket.on('room:setLevel', (data: { levelId: number }) => {
    const room = rooms.get(roomCode);
    if (!room || mySlot !== 0 || room.started) return;
    room.levelId = data.levelId;
    socket.to(roomCode).emit('room:levelChanged', { levelId: data.levelId });
  });

  // ── Start game (host only) ─────────────────────────────────────────────────
  socket.on('room:start', () => {
    const room = rooms.get(roomCode);
    if (!room || mySlot !== 0 || room.started || room.players.size < 2) return;
    room.started = true;
    io.to(roomCode).emit('room:started', {
      numPlayers: room.players.size,
      levelId:    room.levelId,
    });
    console.log(`[${roomCode}] started — ${room.players.size} players, level ${room.levelId}`);
  });

  // ── In-game relay (attach sender's slot to every message) ────────────────
  socket.on('p:input', (data: object) =>
    socket.to(roomCode).emit('p:input', { slot: mySlot, ...data }));

  socket.on('p:state', (data: object) =>
    socket.to(roomCode).emit('p:state', { slot: mySlot, ...data }));

  socket.on('game:ev', (data: object) =>
    socket.to(roomCode).emit('game:ev', { slot: mySlot, ...data }));

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.players.delete(socket.id);
    io.to(roomCode).emit('player:left', { slot: mySlot });
    if (room.players.size === 0) { rooms.delete(roomCode); console.log(`[${roomCode}] deleted`); }
    else console.log(`[${roomCode}] player ${mySlot} left (${room.players.size} remain)`);
  });
});

http.listen(PORT, () => console.log(`Shiftbound server on :${PORT}`));
