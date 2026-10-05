import * as THREE from 'three';

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  // distorted pale face
  x.fillStyle = '#c9c0a8';
  x.beginPath(); x.ellipse(128, 130, 78, 100, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#0a0a0a';
  x.beginPath(); x.ellipse(98, 110, 18, 26, 0.2, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(158, 110, 18, 26, -0.2, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5a0000';
  x.beginPath(); x.ellipse(128, 190, 34, 26, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#e8e0d0';
  for (let i = -2; i <= 2; i++) { x.fillRect(128 + i * 12 - 3, 172, 6, 22); }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function labelSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px Segoe UI, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.9)';
  x.strokeText(text, 128, 34);
  x.fillStyle = color;
  x.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true, sizeAttenuation: true }));
  spr.scale.set(0.95, 0.24, 1);
  return spr;
}

const COLORS = [0xd0a24a, 0x5fae6f, 0x6f8fd0, 0xd06f8f, 0xbf6fd0, 0xd0cf6f];

export class EntityView {
  constructor(scene, level) {
    this.scene = scene;
    this.level = level;
    this.rush = null;
    this.rushT = 0;
    this.figure = new Map(); // room -> mesh
    this.grumble = null;
    this.flashLight = new THREE.PointLight(0xff2200, 0, 40, 2);
    scene.add(this.flashLight);
  }

  // ---- Rush ----
  spawnRush(room) {
    this.clearRush();
    const L = this.level.L, W = this.level.W, H = this.level.H;
    const cz = this.level.centerZ(room);
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, side: THREE.DoubleSide, color: 0xbbbbbb });
    // layered mass
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, H * 0.95), mat.clone());
      p.material.opacity = 0.5 - i * 0.08;
      p.position.z = i * 0.6 - 1;
      g.add(p);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 16), new THREE.MeshBasicMaterial({ color: 0x090909, transparent: true, opacity: 0.85 }));
    core.scale.set(1, 1.2, 2.4);
    g.add(core);
    const glow = new THREE.PointLight(0xff2a10, 4, 26, 2);
    g.add(glow);
    g.position.set(0, H / 2, cz + L / 2 + 2);
    this.scene.add(g);
    this.rush = g;
    this.rushT = 0;
  }

  updateRush(dt, duration = 2.8) {
    if (!this.rush) return;
    this.rushT += dt;
    const room = this.level.roomAt(this.rush.position.z);
    const cz = this.level.centerZ(room);
    const startZ = cz + this.level.L / 2 + 2;
    const endZ = cz - this.level.L / 2 - 2;
    const t = Math.min(1, this.rushT / duration);
    this.rush.position.z = startZ + (endZ - startZ) * t;
    this.rush.rotation.z = Math.sin(this.rushT * 40) * 0.03;
    this.flashLight.position.set(0, this.level.H / 2, this.rush.position.z + 2);
    this.flashLight.intensity = 3 * (1 - t);
    if (t >= 1) this.clearRush();
  }

  clearRush() {
    if (this.rush) { this.scene.remove(this.rush); this.rush.traverse(o => o.geometry && o.geometry.dispose()); this.rush = null; }
    this.flashLight.intensity = 0;
  }

  // ---- Figure ----
  spawnFigure(room) {
    if (this.figure.has(room)) return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 2.2, 12), mat);
    body.position.y = 1.1; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 14), mat);
    head.position.y = 2.5; g.add(head);
    const eMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eMat);
      e.position.set(s * 0.15, 2.55, -0.38); g.add(e);
    }
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 8), mat);
      arm.position.set(s * 0.62, 1.3, 0); arm.rotation.z = s * 0.15; g.add(arm);
    }
    g.position.set(0, 0, this.level.centerZ(room) + this.level.L / 2 + 3);
    this.scene.add(g);
    this.figure.set(room, g);
  }

  moveFigure(room, x, z) {
    const g = this.figure.get(room);
    if (!g) return;
    g.position.x = x;
    g.position.z = this.level.centerZ(room) + z;
    g.rotation.y = Math.atan2(-(this.lastFigureX - x || 0), -(this.lastFigureZ - z || 0));
    this.lastFigureX = x; this.lastFigureZ = z;
  }

  clearFigure(room) {
    const g = this.figure.get(room);
    if (g) { this.scene.remove(g); g.traverse(o => o.geometry && o.geometry.dispose()); this.figure.delete(room); }
  }

  // ---- Grumble ----
  spawnGrumble(room) {
    if (this.grumble) return;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.85, emissive: 0x1a0500, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 18, 18), bodyMat);
    body.scale.set(1, 1.25, 1.15); body.position.y = 2.4; g.add(body);
    // many eyes
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
      const r = 2.3;
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe06a }));
      e.position.set(Math.sin(b) * Math.cos(a) * r, 2.4 + Math.cos(b) * r * 0.8, Math.sin(b) * Math.sin(a) * r);
      g.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0x120000 }));
      p.position.copy(e.position).multiplyScalar(1.06); g.add(p);
    }
    // legs / tentacles
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.12, 3.2, 8), bodyMat);
      leg.position.set(Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4);
      leg.rotation.z = Math.cos(a) * 0.3; leg.rotation.x = Math.sin(a) * 0.3;
      g.add(leg);
    }
    const glow = new THREE.PointLight(0xff8030, 2.5, 30, 2);
    glow.position.y = 2.4; g.add(glow);
    g.position.set(0, 0, this.level.centerZ(room) + this.level.L / 2 + 6);
    this.scene.add(g);
    this.grumble = g;
  }

  moveGrumble(room, x, z) {
    if (!this.grumble) return;
    const g = this.grumble;
    const px = g.position.x, pz = g.position.z;
    g.position.x = x;
    g.position.z = this.level.centerZ(room) + z;
    g.rotation.y = Math.atan2(g.position.x - px, g.position.z - pz);
  }

  clearGrumble() {
    if (this.grumble) { this.scene.remove(this.grumble); this.grumble.traverse(o => o.geometry && o.geometry.dispose()); this.grumble = null; }
  }

  clearAll() { this.clearRush(); for (const r of [...this.figure.keys()]) this.clearFigure(r); this.clearGrumble(); }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
  }

  update(list, selfId, hidingRooms) {
    const seen = new Set();
    for (const p of list) {
      if (p.id === selfId) continue;
      seen.add(p.id);
      let rp = this.map.get(p.id);
      if (!rp) {
        rp = this.make(p);
        this.scene.add(rp.g);
        this.map.set(p.id, rp);
      }
      rp.target.set(p.x, 0, p.z);
      rp.ry = p.ry;
      rp.name.position.set(0, 2.55, 0);
      if (p.down) {
        rp.g.rotation.z = Math.PI / 2;
        rp.g.position.y = 0.5;
      } else {
        rp.g.rotation.z = 0;
        rp.g.position.y = 0;
      }
      rp.down = p.down;
    }
    for (const [id, rp] of [...this.map]) {
      if (!seen.has(id)) {
        this.scene.remove(rp.g);
        rp.g.traverse(o => o.geometry && o.geometry.dispose());
        this.map.delete(id);
        continue;
      }
      // interpolate
      rp.g.position.x += (rp.target.x - rp.g.position.x) * 0.2;
      rp.g.position.z += (rp.target.z - rp.g.position.z) * 0.2;
      // smooth yaw
      let d = rp.ry - rp.g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      rp.g.rotation.y += d * 0.2;
    }
  }

  make(p) {
    const g = new THREE.Group();
    const color = COLORS[Math.abs(hash(p.id)) % COLORS.length];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 6, 12), bodyMat);
    body.position.y = 1.0; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), new THREE.MeshStandardMaterial({ color: 0xe8c9a0 }));
    head.position.y = 1.75; g.add(head);
    const name = labelSprite(p.name, '#ffe9b0');
    name.position.y = 2.55;
    g.add(name);
    return { g, target: new THREE.Vector3(p.x, 0, p.z), ry: p.ry, name, down: false };
  }

  clear() {
    for (const [, rp] of this.map) { this.scene.remove(rp.g); }
    this.map.clear();
  }
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
