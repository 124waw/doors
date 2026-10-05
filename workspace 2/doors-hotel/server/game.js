// DOORS: Hotel — server authoritative game logic
// Deterministic floor generation + co-op entity events + room state.

export const CFG = {
  ROOM_LEN: 34,
  ROOM_W: 16,
  ROOM_H: 6,
  FLOOR_ROOMS: 70,
  MAX_PLAYERS: 4,
  TICK_HZ: 20,
};

const KINDS = {
  LOBBY: 'lobby',
  HALL: 'hall',
  DINING: 'dining',
  LIBRARY: 'library',
  GREENHOUSE: 'greenhouse',
  ELECTRICAL: 'electrical',
  BOSS: 'boss',
  EXIT: 'exit',
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function generateFloor(seed = (Math.random() * 1e9) | 0) {
  const rng = mulberry32(seed);
  const N = CFG.FLOOR_ROOMS;
  const rooms = [];

  const special = {
    0: KINDS.LOBBY,
    12: KINDS.DINING,
    24: KINDS.LIBRARY,
    36: KINDS.GREENHOUSE,
    48: KINDS.ELECTRICAL,
    60: KINDS.BOSS,
    [N - 1]: KINDS.EXIT,
  };

  for (let i = 0; i < N; i++) {
    let kind = special[i] || KINDS.HALL;
    const isSpecial = !!special[i];
    const safe = kind === KINDS.LOBBY || kind === KINDS.EXIT;

    // darkness curve: more dark rooms deeper in
    const darkChance = 0.28 + 0.4 * (i / N);
    const dark = !safe && kind !== KINDS.LOBBY && rng() < darkChance;

    const room = {
      id: i,
      kind,
      dark,
      seed: Math.floor(rng() * 1e9),
      closets: [],
      hazards: [],
      isSpecial,
    };

    // closets (hiding spots). Most rooms have 2-4, guaranteed in rush rooms.
    const closetCount = safe ? 0 : 2 + Math.floor(rng() * 3);
    for (let c = 0; c < closetCount; c++) {
      const side = rng() < 0.5 ? -1 : 1;
      room.closets.push({
        side,
        z: (rng() - 0.5) * (CFG.ROOM_LEN - 8),
      });
    }

    // Rush — hallway sweeper, not in safe/special rooms
    if (!safe && !isSpecial && rng() < 0.34) {
      room.hazards.push({ type: 'rush' });
      room.closets = [
        { side: -1, z: (rng() - 0.5) * (CFG.ROOM_LEN - 8) },
        { side: 1, z: (rng() - 0.5) * (CFG.ROOM_LEN - 8) },
        { side: -1, z: (rng() - 0.5) * (CFG.ROOM_LEN - 8) },
      ];
    }

    // Eyes — only in dark rooms
    if (dark && kind !== KINDS.GREENHOUSE && rng() < 0.45) {
      room.hazards.push({
        type: 'eyes',
        x: (rng() - 0.5) * (CFG.ROOM_W - 5),
        z: (rng() - 0.5) * (CFG.ROOM_LEN - 8),
      });
    }

    // Special set pieces
    if (kind === KINDS.LIBRARY) room.hazards.push({ type: 'figure' });
    if (kind === KINDS.GREENHOUSE) {
      room.hazards.push({ type: 'eyes', x: 0, z: -6 });
      room.hazards.push({ type: 'rush' });
    }
    if (kind === KINDS.BOSS) room.hazards.push({ type: 'grumble' });

    rooms.push(room);
  }

  // Locked doors + key spawns. Door i connects room i -> i+1.
  const lock = [];
  const keys = {};
  for (let i = 0; i < N - 1; i++) {
    const safe = i === 0;
    const isLocked = !safe && i < N - 2 && rng() < 0.36;
    lock[i] = isLocked;
    if (isLocked) {
      keys[i] = {
        door: i,
        room: i,
        x: (rng() - 0.5) * (CFG.ROOM_W - 5),
        z: (rng() - 0.5) * (CFG.ROOM_LEN - 10),
        taken: false,
      };
    }
  }

  return {
    seed,
    cfg: CFG,
    rooms,
    lock,
    keys,
    N,
    unlocked: lock.map(() => false),
  };
}

export class GameRoom {
  constructor(io, code = 'MAIN') {
    this.io = io;
    this.code = code;
    this.emit = (ev, data) => this.io.to(this.code).emit(ev, data);
    this.players = new Map();
    this.status = 'lobby'; // lobby | playing | won | lost
    this.reset();
  }

  reset() {
    this.floor = generateFloor();
    this.status = 'lobby';
    this.startedAt = 0;
    this.figureStates = new Map();
    this.bossState = null;
    this.rushStates = new Map();
    this.lastBroadcast = 0;
    this.tickTimer = null;
  }

  playerList() {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      ry: p.ry,
      room: p.room,
      hiding: p.hiding,
      light: p.light,
      health: p.health,
      down: p.down,
      ready: p.ready,
    }));
  }

  addPlayer(socket, name) {
    const p = {
      id: socket.id,
      name: (name || 'Guest').slice(0, 14) || 'Guest',
      x: 0,
      y: 1.7,
      z: 0,
      ry: 0,
      room: 0,
      hiding: false,
      light: false,
      health: 100,
      down: false,
      ready: false,
      keys: new Set(),
      lastNoise: 0,
      reviving: false,
    };
    this.players.set(socket.id, p);
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  start() {
    if (this.status === 'playing') return;
    this.floor = generateFloor();
    this.status = 'playing';
    this.startedAt = Date.now();
    this.figureStates.clear();
    this.rushStates.clear();
    this.bossState = null;
    for (const p of this.players.values()) {
      p.x = 0;
      p.z = 0;
      p.room = 0;
      p.health = 100;
      p.down = false;
      p.hiding = false;
      p.light = false;
      p.keys.clear();
    }
    this.emit('gameState', { status: 'playing', floor: this.floor });
    this.startTicking();
  }

  startTicking() {
    if (this.tickTimer) return;
    const dt = 1000 / CFG.TICK_HZ;
    this.tickTimer = setInterval(() => this.tick(dt / 1000), dt);
  }

  stopTicking() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  // ---- client-driven actions ----
  updatePlayerState(id, s) {
    const p = this.players.get(id);
    if (!p) return;
    if (typeof s.x === 'number') p.x = s.x;
    if (typeof s.y === 'number') p.y = s.y;
    if (typeof s.z === 'number') p.z = s.z;
    if (typeof s.ry === 'number') p.ry = s.ry;
    if (typeof s.hiding === 'boolean') p.hiding = s.hiding;
    if (typeof s.light === 'boolean') p.light = s.light;
    if (typeof s.room === 'number') p.room = Math.max(0, Math.min(this.floor.N - 1, s.room | 0));
    if (typeof s.speed === 'number') p.speed = s.speed;
  }

  interact(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    if (msg.type === 'door') {
      const d = msg.door | 0;
      if (!this.floor.lock[d]) return this.emit('doorUnlocked', { door: d });
      if (this.floor.unlocked[d]) return this.emit('doorUnlocked', { door: d });
      if (p.keys.has(d)) {
        this.floor.unlocked[d] = true;
        this.emit('doorUnlocked', { door: d });
      } else {
      }
    }
  }

  pickupKey(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    const d = msg.door | 0;
    const key = this.floor.keys[d];
    if (!key || key.taken) return;
    // key coords are room-local; convert to world for the distance check
    const worldKeyZ = -key.room * CFG.ROOM_LEN + key.z;
    const dx = p.x - key.x;
    const dz = p.z - worldKeyZ;
    if (Math.hypot(dx, dz) > 3.2) return;
    key.taken = true;
    // co-op: everyone advances together. Give all living players the key.
    for (const q of this.players.values()) q.keys.add(d);
    this.emit('keyPicked', { door: d });
  }

  revive(id, msg) {
    const p = this.players.get(id);
    const target = this.players.get(msg.target);
    if (!p || !target || !target.down) return;
    const dist = Math.hypot(p.x - target.x, p.z - target.z);
    if (dist > 2.5) return;
    target.down = false;
    target.health = 40;
    this.emit('revived', { id: target.id, by: p.id });
  }

  damage(id, amount, source) {
    const p = this.players.get(id);
    if (!p || p.down) return;
    p.health -= amount;
    if (p.health <= 0) {
      p.health = 0;
      p.down = true;
      this.emit('playerDown', { id, source });
      this.checkWipe();
    }
  }

  checkWipe() {
    const alive = [...this.players.values()].filter((p) => !p.down);
    if (alive.length === 0 && this.players.size > 0 && this.status === 'playing') {
      this.status = 'lost';
      this.emit('gameState', { status: 'lost' });
      this.stopTicking();
    }
  }

  win() {
    if (this.status !== 'playing') return;
    this.status = 'won';
    this.emit('gameState', { status: 'won' });
    this.stopTicking();
  }

  // ---- simulation ----
  tick(dt) {
    const now = Date.now();
    // room occupancy with room-local coordinates for hazard math
    const occ = new Map();
    for (const p of this.players.values()) {
      if (!occ.has(p.room)) occ.set(p.room, []);
      occ.get(p.room).push({ p, lx: p.x, lz: p.z + p.room * CFG.ROOM_LEN });
    }

    for (const [roomId, entries] of occ) {
      const room = this.floor.rooms[roomId];
      if (!room) continue;
      for (const hz of room.hazards) {
        if (hz.type === 'rush') this.tickRush(room, entries, dt);
        if (hz.type === 'eyes') this.tickEyes(room, hz, entries, dt);
        if (hz.type === 'figure') this.tickFigure(room, entries, dt);
        if (hz.type === 'grumble') this.tickGrumble(room, entries, dt);
      }
    }

    // exit check
    const exitRoom = this.floor.N - 1;
    const allAtExit =
      this.players.size > 0 &&
      [...this.players.values()].every((p) => p.room >= exitRoom || p.down);
    if (allAtExit && this.status === 'playing') this.win();

    if (now - this.lastBroadcast > 60) {
      this.lastBroadcast = now;
      this.emit('players', this.playerList());
    }
  }

  tickRush(room, entries, dt) {
    let st = this.rushStates.get(room.id);
    if (!st) {
      st = { phase: 'idle', t: 0, next: 14 + Math.random() * 26 };
      this.rushStates.set(room.id, st);
    }
    const alive = entries.filter((e) => !e.p.down);
    if (alive.length === 0) return;
    st.t += dt;
    if (st.phase === 'idle') {
      if (st.t >= st.next) {
        st.phase = 'warn'; st.t = 0;
        this.emit('entity', { room: room.id, type: 'rush', phase: 'warn' });
      }
    } else if (st.phase === 'warn') {
      if (st.t >= 2.6) {
        st.phase = 'sweep'; st.t = 0;
        this.emit('entity', { room: room.id, type: 'rush', phase: 'sweep' });
      }
    } else if (st.phase === 'sweep') {
      if (st.t >= 2.8) {
        for (const e of alive) if (!e.p.hiding) this.damage(e.p.id, 100, 'rush');
        st.phase = 'idle'; st.t = 0; st.next = 18 + Math.random() * 30;
        this.emit('entity', { room: room.id, type: 'rush', phase: 'end' });
      }
    }
  }

  tickEyes(room, hz, entries, dt) {
    for (const e of entries) {
      if (e.p.down) continue;
      const vx = hz.x - e.lx;
      const vz = hz.z - e.lz;
      const dist = Math.hypot(vx, vz);
      if (dist > 22 || dist < 0.001) continue;
      const facingX = -Math.sin(e.p.ry);
      const facingZ = -Math.cos(e.p.ry);
      const dot = (vx / dist) * facingX + (vz / dist) * facingZ;
      if (dot > 0.86) this.damage(e.p.id, 26 * dt, 'eyes');
    }
  }

  tickFigure(room, entries, dt) {
    const alive = entries.filter((e) => !e.p.down);
    if (alive.length === 0) { this.figureStates.delete(room.id); return; }
    let f = this.figureStates.get(room.id);
    if (!f) { f = { x: 0, z: CFG.ROOM_LEN / 2 + 3, speed: 4.0 }; this.figureStates.set(room.id, f); }
    let target = null, bestNoise = 0;
    for (const e of alive) {
      let noise = 0;
      if (e.p.light) noise += 3;
      if ((e.p.speed || 0) > 5.4) noise += 4;
      if (noise > bestNoise) { bestNoise = noise; target = e; }
    }
    const cx = CFG.ROOM_W / 2 - 0.6;
    if (target && bestNoise > 0) f.target = { x: target.lx, z: target.lz };
    const goal = f.target || { x: 0, z: -CFG.ROOM_LEN / 2 - 2 };
    const dx = goal.x - f.x, dz = goal.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    f.x = Math.max(-cx, Math.min(cx, f.x + (dx / d) * f.speed * dt));
    f.z += (dz / d) * f.speed * dt;
    for (const e of alive) {
      if (Math.hypot(e.lx - f.x, e.lz - f.z) < 1.9) this.damage(e.p.id, 100, 'figure');
    }
    this.emit('entityMove', { room: room.id, type: 'figure', x: f.x, z: f.z });
  }

  tickGrumble(room, entries, dt) {
    const alive = entries.filter((e) => !e.p.down);
    if (alive.length === 0) { this.bossState = null; return; }
    if (!this.bossState) {
      this.bossState = { x: 0, z: CFG.ROOM_LEN / 2 + 6, speed: 3.4, phase: 'wake' };
      this.emit('entity', { room: room.id, type: 'grumble', phase: 'wake' });
    }
    const b = this.bossState;
    b.phase = 'chase';
    let nearest = null, nd = Infinity;
    for (const e of alive) {
      const d = Math.hypot(e.lx - b.x, e.lz - b.z);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest) {
      const dx = nearest.lx - b.x, dz = nearest.lz - b.z;
      const d = Math.hypot(dx, dz) || 1;
      b.x += (dx / d) * b.speed * dt;
      b.z += (dz / d) * b.speed * dt;
      for (const e of alive) {
        if (Math.hypot(e.lx - b.x, e.lz - b.z) < 2.2) this.damage(e.p.id, 55 * dt, 'grumble');
      }
    }
    this.emit('entityMove', { room: room.id, type: 'grumble', x: b.x, z: b.z });
  }
}
