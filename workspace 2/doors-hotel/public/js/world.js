import * as THREE from 'three';
import { MAT, painting, numberPlate, foliage } from './textures.js';

const DOOR_W = 3.2;
const DOOR_H = 4.2;

export class Level {
  constructor(scene, floor) {
    this.scene = scene;
    this.floor = floor;
    this.N = floor.N;
    this.L = floor.cfg.ROOM_LEN;
    this.W = floor.cfg.ROOM_W;
    this.H = floor.cfg.ROOM_H;

    this.group = new THREE.Group();
    scene.add(this.group);

    this.built = new Map();
    this.doors = new Map();     // index -> {pivot, open, targetRot}
    this.doorOpen = floor.unlocked.slice();
    this.closets = [];          // {room, x, z}
    this.colliders = [];        // world AABB {minX,maxX,minZ,maxZ,room}
    this.keys = new Map();      // doorIndex -> mesh group
    this.eyeMeshes = new Map(); // roomId -> group
    this.panels = [];           // emissive light panels (for toggling by room)
    this.window = null;
    this.animDoors = [];

    this.buildWindow(0, 3);
  }

  centerZ(i) { return -i * this.L; }
  roomAt(z) { return Math.max(0, Math.min(this.N - 1, Math.round(-z / this.L))); }

  buildWindow(min, max) {
    min = Math.max(0, min);
    max = Math.min(this.N - 1, max);
    if (this.window && this.window[0] === min && this.window[1] === max) return;
    for (const i of [...this.built]) if (i < min || i > max) this.removeRoom(i);
    for (let i = min; i <= max; i++) if (!this.built.has(i)) this.buildRoom(i);
    this.window = [min, max];
  }

  setDoorOpen(i, open) {
    this.doorOpen[i] = open;
    const d = this.doors.get(i);
    if (d) {
      d.open = open;
      this.io_animate = true;
    }
  }

  removeRoom(i) {
    const g = this.built.get(i);
    if (g) {
      this.group.remove(g);
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.built.delete(i);
    this.doors.delete(i);
    if (this.eyeMeshes.has(i)) this.eyeMeshes.delete(i);
    this.closets = this.closets.filter((c) => c.room !== i);
    this.colliders = this.colliders.filter((c) => c.room !== i);
    this.panels = this.panels.filter((p) => p.userData.room !== i);
  }

  // ---------- geometry helpers ----------
  box(g, w, h, d, x, y, z, mat, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = false; m.receiveShadow = false;
    g.add(m);
    return m;
  }

  buildRoom(i) {
    const room = this.floor.rooms[i];
    const g = new THREE.Group();
    const cz = this.centerZ(i);
    const W = this.W, L = this.L, H = this.H;
    this.group.add(g);
    this.built.set(i, g);

    const isLobby = room.kind === 'lobby';
    const isLib = room.kind === 'library';
    const isGreen = room.kind === 'greenhouse';
    const isElec = room.kind === 'electrical';
    const isBoss = room.kind === 'boss';
    const isDining = room.kind === 'dining';

    const wallMat = isLib ? MAT.wallGreen : isElec ? MAT.concrete : isBoss ? MAT.concrete : isGreen ? MAT.wallGreen : isLobby ? MAT.wallRed : MAT.wallRed;
    const floorMat = isLobby ? MAT.marble : isElec || isBoss ? MAT.concrete : isLib ? MAT.wood : MAT.carpet;

    // floor + ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, cz);
    g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L), isGreen ? MAT.ceiling : MAT.ceiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, cz);
    g.add(ceil);

    // side walls
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat);
      w.position.set(s * W / 2, H / 2, cz);
      w.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(w);
    }

    // baseboard trim
    for (const s of [-1, 1]) {
      this.box(g, 0.2, 0.35, L, s * (W / 2 - 0.1), 0.175, cz, MAT.gold);
    }

    // back wall for room 0
    if (i === 0) this.box(g, W, H, 0.3, 0, H / 2, cz + L / 2, wallMat);

    // far wall with doorway
    this.buildEndWall(g, i, cz - L / 2, wallMat);

    // carpet runner
    if (!isElec && !isBoss) {
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(3.4, L - 2), MAT.gold);
      runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.02, cz);
      g.add(runner);
    }

    this.decorate(g, i, room, cz);

    // closets
    room.closets.forEach((c, idx) => this.buildCloset(g, i, c, cz, idx));

    // keys
    const key = this.floor.keys[i];
    if (key && !key.taken && !this.keys.has(i)) this.buildKey(g, key, cz);

    // eyes
    for (const hz of room.hazards) {
      if (hz.type === 'eyes') this.buildEyes(g, i, hz, cz);
    }

    // lighting panel + hint
    if (!room.dark) this.addLightPanel(g, i, cz);
    if (room.dark) this.addDarkness(g, i, cz, room.kind);
  }

  buildEndWall(g, i, z, wallMat) {
    const W = this.W;
    const sideW = (W - DOOR_W) / 2;
    // left / right segments
    this.box(g, sideW, this.H, 0.3, -(DOOR_W / 2 + sideW / 2), this.H / 2, z, wallMat);
    this.box(g, sideW, this.H, 0.3, (DOOR_W / 2 + sideW / 2), this.H / 2, z, wallMat);
    // lintel
    const lintelH = this.H - DOOR_H;
    this.box(g, DOOR_W, lintelH, 0.3, 0, DOOR_H + lintelH / 2, z, wallMat);
    // gold frame
    this.box(g, 0.28, DOOR_H, 0.36, -DOOR_W / 2, DOOR_H / 2, z, MAT.gold);
    this.box(g, 0.28, DOOR_H, 0.36, DOOR_W / 2, DOOR_H / 2, z, MAT.gold);
    this.box(g, DOOR_W + 0.5, 0.28, 0.36, 0, DOOR_H, z, MAT.gold);

    // number plaque
    const next = Math.min(this.N - 1, i + 1);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.7),
      new THREE.MeshStandardMaterial({ map: numberPlate(i + 1), emissive: 0x554422, emissiveIntensity: 0.2 })
    );
    plate.position.set(0, DOOR_H + 0.55, z + 0.17);
    g.add(plate);

    // door panel on hinge
    const pivot = new THREE.Group();
    pivot.position.set(-DOOR_W / 2, 0, z);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.08, DOOR_H - 0.1, 0.14), MAT.wood);
    panel.position.set((DOOR_W - 0.08) / 2, (DOOR_H - 0.1) / 2, 0);
    pivot.add(panel);
    // panels / handle detail
    const inset = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W - 0.8, DOOR_H - 1.0, 0.05), MAT.woodLight);
    inset.position.set((DOOR_W - 0.08) / 2, (DOOR_H - 0.1) / 2, 0.09);
    pivot.add(inset);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), MAT.gold);
    knob.position.set(DOOR_W - 0.55, 1.35, 0.14);
    pivot.add(knob);
    g.add(pivot);

    const open = !!this.doorOpen[i];
    const targetRot = open ? -Math.PI / 2 : 0;
    pivot.rotation.y = targetRot;
    this.doors.set(i, { pivot, open, targetRot });

    // darkness beyond if next room dark handled by its own build.
  }

  buildCloset(g, roomId, c, cz, idx) {
    const side = c.side;
    const x = side * (this.W / 2 - 0.55);
    const z = cz + c.z;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    this.box(grp, 1.5, 2.4, 0.9, 0, 1.2, 0, MAT.wood);
    // doors on wardrobe
    const d1 = this.box(grp, 0.68, 2.1, 0.06, -0.36, 1.2, 0.47, MAT.woodLight);
    const d2 = this.box(grp, 0.68, 2.1, 0.06, 0.36, 1.2, 0.47, MAT.woodLight);
    this.box(grp, 0.05, 0.25, 0.08, -0.06, 1.2, 0.51, MAT.gold);
    this.box(grp, 0.05, 0.25, 0.08, 0.06, 1.2, 0.51, MAT.gold);
    this.box(grp, 1.6, 0.12, 1.0, 0, 2.45, 0, MAT.gold);
    g.add(grp);

    const cw = 0.85, cd = 0.6;
    this.closets.push({ room: roomId, x, z, grp, d1, d2 });
    this.colliders.push({ minX: x - cw, maxX: x + cw, minZ: z - cd, maxZ: z + cd, room: roomId });
  }

  buildKey(g, key, cz) {
    const grp = new THREE.Group();
    grp.position.set(key.x, 1.1, cz + key.z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf1cf6a, emissive: 0xc79a2a, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.25 });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 18), mat);
    grp.add(bow);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), mat);
    shaft.position.y = -0.28; grp.add(shaft);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.05), mat);
    bit.position.set(0.08, -0.5, 0); grp.add(bit);
    grp.userData.base = 1.1;
    g.add(grp);
    this.keys.set(key.door, grp);
  }

  buildEyes(g, roomId, hz, cz) {
    const grp = new THREE.Group();
    grp.position.set(hz.x, 2.3, cz + hz.z);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), eyeMat);
      e.position.x = s * 0.32;
      grp.add(e);
      const glow = new THREE.PointLight(0xff2a10, 1.2, 6, 2);
      glow.position.x = s * 0.32;
      grp.add(glow);
    }
    g.add(grp);
    this.eyeMeshes.set(roomId, grp);
  }

  addLightPanel(g, roomId, cz) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), MAT.panel.clone());
    panel.rotation.x = Math.PI / 2;
    panel.position.set(0, this.H - 0.05, cz);
    panel.userData.room = roomId;
    g.add(panel);
    // sconces
    for (const s of [-1, 1]) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), MAT.panel.clone());
      sc.position.set(s * (this.W / 2 - 0.06), 3.2, cz + this.L / 3);
      sc.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      sc.userData.room = roomId;
      g.add(sc);
    }
  }

  addDarkness(g, roomId, cz, kind) {
    // faint red emergency strip so geometry is barely readable
    for (const s of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(this.L - 2, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x501010 })
      );
      strip.position.set(s * (this.W / 2 - 0.05), 0.5, cz);
      strip.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      strip.userData.room = roomId;
      g.add(strip);
    }
  }

  // ---------- decor ----------
  decorate(g, i, room, cz) {
    switch (room.kind) {
      case 'lobby': return this.decorLobby(g, cz);
      case 'library': return this.decorLibrary(g, i, cz);
      case 'greenhouse': return this.decorGreenhouse(g, i, cz);
      case 'electrical': return this.decorElectrical(g, i, cz);
      case 'dining': return this.decorDining(g, i, cz);
      case 'boss': return this.decorBoss(g, cz);
      default: return this.decorHall(g, i, cz);
    }
  }

  decorLobby(g, cz) {
    // grand chandelier
    const ch = new THREE.Group();
    ch.position.set(0, this.H - 1.2, cz);
    this.box(ch, 2.2, 0.3, 2.2, 0, 0, 0, MAT.gold);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const arm = this.box(ch, 0.08, 1.0, 0.08, Math.cos(a) * 1.0, 0.5, Math.sin(a) * 1.0, MAT.gold);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
      flame.position.set(Math.cos(a) * 1.0, 1.05, Math.sin(a) * 1.0);
      ch.add(flame);
    }
    const chLight = new THREE.PointLight(0xffdca0, 2.2, 30, 2);
    chLight.position.y = 1.2; ch.add(chLight);
    g.add(ch);

    // columns
    for (const s of [-1, 1]) {
      for (let k = -1; k <= 1; k++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, this.H, 16), MAT.marble);
        col.position.set(s * (this.W / 2 - 1.2), this.H / 2, cz + k * 9);
        g.add(col);
      }
    }
    // reception desk
    this.box(g, 5, 1.2, 1.2, -4.5, 0.6, cz + 9, MAT.wood);
    this.box(g, 5.2, 0.15, 1.4, -4.5, 1.25, cz + 9, MAT.gold);
    // paintings
    g.add(this.paintingMesh(6, 2.6, cz + 12, -1, 0));
    g.add(this.paintingMesh(6, 2.6, cz - 6, 1, 1));
    // sofas
    this.box(g, 3, 0.7, 1.1, 5, 0.35, cz + 8, MAT.wallRed);
    this.box(g, 3, 0.5, 0.3, 5, 0.75, cz + 8.4, MAT.wallRed);
  }

  decorHall(g, i, cz) {
    const side = i % 2 === 0 ? -1 : 1;
    g.add(this.paintingMesh(this.W / 2 - 0.06, 2.6, cz - 8, -side, i % 4));
    if (i % 3 === 0) {
      this.box(g, 0.4, 1.0, 1.6, side * (this.W / 2 - 0.9), 0.5, cz + 7, MAT.wood);
      const plant = this.box(g, 0.5, 0.6, 0.5, side * (this.W / 2 - 0.9), 1.35, cz + 7, MAT.foliage);
      this.colliders.push({ minX: side * (this.W / 2 - 0.9) - 0.4, maxX: side * (this.W / 2 - 0.9) + 0.4, minZ: cz + 6.5, maxZ: cz + 7.5, room: i });
    }
    if (i % 4 === 1) {
      this.box(g, 1.2, 1.6, 1.4, side * (this.W / 2 - 1.0), 0.8, cz + 2, MAT.wood);
      this.colliders.push({ minX: side * (this.W / 2 - 1.0) - 0.7, maxX: side * (this.W / 2 - 1.0) + 0.7, minZ: cz + 1.2, maxZ: cz + 2.8, room: i });
    }
  }

  decorLibrary(g, i, cz) {
    for (const s of [-1, 1]) {
      for (let k = -2; k <= 2; k++) {
        const shelf = this.box(g, 0.7, 3.2, 3.2, s * (this.W / 2 - 0.6), 1.6, cz + k * 5.2, MAT.wood);
        for (let r = 0; r < 4; r++) {
          for (let b = 0; b < 6; b++) {
            this.box(g, 0.6, 0.45, 0.28, s * (this.W / 2 - 0.6), 0.5 + r * 0.7, cz + k * 5.2 - 1.2 + b * 0.44, new THREE.MeshStandardMaterial({ color: [0x5a2a2a, 0x2a3a5a, 0x3a5a2a, 0x5a5a2a][(r + b) % 4], roughness: 1 }));
          }
        }
        this.colliders.push({ minX: s * (this.W / 2 - 0.6) - 0.4, maxX: s * (this.W / 2 - 0.6) + 0.4, minZ: cz + k * 5.2 - 1.7, maxZ: cz + k * 5.2 + 1.7, room: i });
      }
    }
    // reading tables with candles
    for (const k of [-1, 1]) {
      this.box(g, 2.4, 0.1, 1.2, 0, 1.0, cz + k * 6, MAT.wood);
      for (const [dx, dz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]])
        this.box(g, 0.1, 1.0, 0.1, dx, 0.5, cz + k * 6 + dz, MAT.wood);
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
      candle.position.set(0, 1.25, cz + k * 6); g.add(candle);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a }));
      fl.position.set(0, 1.5, cz + k * 6); g.add(fl);
      const l = new THREE.PointLight(0xff9a3a, 0.9, 7, 2); l.position.set(0, 1.5, cz + k * 6); g.add(l);
    }
  }

  decorGreenhouse(g, i, cz) {
    for (const s of [-1, 1]) {
      for (const k of [-1, 0, 1]) {
        this.box(g, 1.6, 1.0, 1.6, s * (this.W / 2 - 1.0), 0.5, cz + k * 9, MAT.wood);
        const bush = this.box(g, 1.4, 1.6, 1.4, s * (this.W / 2 - 1.0), 1.8, cz + k * 9, MAT.foliage);
        this.colliders.push({ minX: s * (this.W / 2 - 1.0) - 0.9, maxX: s * (this.W / 2 - 1.0) + 0.9, minZ: cz + k * 9 - 0.9, maxZ: cz + k * 9 + 0.9, room: i });
      }
    }
    // hanging plants
    for (let k = -1; k <= 1; k++) {
      const p = this.box(g, 1.8, 0.6, 1.8, 0, this.H - 0.6, cz + k * 10, MAT.foliage);
    }
  }

  decorElectrical(g, i, cz) {
    for (const s of [-1, 1]) {
      this.box(g, 0.3, 1.6, 1.2, s * (this.W / 2 - 0.2), 1.6, cz + 6, MAT.concrete);
      this.box(g, 0.5, 0.05, 0.5, s * (this.W / 2 - 0.35), 2.4, cz + 6, MAT.gold);
    }
    // pipes along ceiling
    for (let k = -1; k <= 1; k += 2) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, this.L, 10), new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.7, roughness: 0.5 }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(k * 1.6, this.H - 0.4, cz);
      g.add(pipe);
    }
    // fuse box
    this.box(g, 1.2, 1.6, 0.3, 0, 2.2, cz + this.L / 2 - 1.2, new THREE.MeshStandardMaterial({ color: 0x33333a, metalness: 0.6 }));
  }

  decorDining(g, i, cz) {
    for (const k of [-1, 0, 1]) {
      this.box(g, 6, 0.15, 1.6, 0, 1.0, cz + k * 8, MAT.wood);
      for (const dx of [-2.6, 0, 2.6])
        this.box(g, 0.15, 1.0, 1.2, dx, 0.5, cz + k * 8, MAT.wood);
      this.colliders.push({ minX: -3.2, maxX: 3.2, minZ: cz + k * 8 - 1.0, maxZ: cz + k * 8 + 1.0, room: i });
      const ch = new THREE.PointLight(0xffdca0, 1.4, 16, 2); ch.position.set(0, this.H - 1, cz + k * 8); g.add(ch);
    }
  }

  decorBoss(g, cz) {
    // cracked pillars + debris, mostly empty arena
    for (const s of [-1, 1]) {
      this.box(g, 1.2, this.H, 1.2, s * (this.W / 2 - 1.2), this.H / 2, cz + 10, MAT.concrete);
      this.colliders.push({ minX: s * (this.W / 2 - 1.2) - 0.7, maxX: s * (this.W / 2 - 1.2) + 0.7, minZ: cz + 9.3, maxZ: cz + 10.7, room: -1 });
    }
    for (let k = 0; k < 6; k++) {
      const r = 0.4 + Math.random() * 0.6;
      const d = this.box(g, r, r, r, (Math.random() - 0.5) * 10, r / 2, cz + (Math.random() - 0.5) * 24, MAT.concrete, Math.random() * 3);
    }
  }

  paintingMesh(x, y, z, side, idx) {
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 0.12), MAT.gold);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.8), new THREE.MeshStandardMaterial({ map: painting(idx) }));
    art.position.z = 0.08;
    grp.add(frame, art);
    grp.position.set(x, y, z);
    grp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    return grp;
  }

  // ---------- per-frame ----------
  update(dt, playerPos, playerRoom) {
    // windowed building
    this.buildWindow(playerRoom - 1, playerRoom + 3);

    // door animation
    for (const [i, d] of this.doors) {
      const target = d.open ? -Math.PI / 2 : 0;
      d.pivot.rotation.y += (target - d.pivot.rotation.y) * Math.min(1, dt * 6);
    }

    // key float/spin + pickup
    for (const grp of this.keys.values()) {
      grp.rotation.y += dt * 2;
      grp.position.y = grp.userData.base + Math.sin(performance.now() / 500) * 0.12;
    }

    // eyes pulse
    for (const grp of this.eyeMeshes.values()) {
      const s = 1 + Math.sin(performance.now() / 300) * 0.15;
      grp.scale.set(s, s, s);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
