import * as THREE from 'three';

const R = 0.45;
const EYE = 1.7;

export class Player {
  constructor(camera, level) {
    this.camera = camera;
    this.level = level;
    this.pos = new THREE.Vector3(0, EYE, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;   // facing -z (into the hotel)
    this.pitch = 0;
    this.keys = {};
    this.sprint = false;
    this.touchMove = null;   // { x: strafe, y: forward } from virtual joystick
    this.touchSprint = false;
    this.hiding = false;
    this.hideCloset = null;
    this.preHide = null;
    this.bob = 0;
    this.speed = 0;
    this.light = false;
    this.room = 0;
    this.lastRoom = 0;
    this.onRoomChange = null;
    this.footstep = 0;
    this.onFootstep = null;
    this.headHeight = EYE;
    this.crouch = 0;
  }

  onMouseMove(dx, dy) {
    const sens = this.hiding ? 0.0016 : 0.0022;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  enterHide(closet) {
    this.hiding = true;
    this.hideCloset = closet;
    this.preHide = this.pos.clone();
    // stand at the wardrobe opening, facing out into the aisle
    const s = Math.sign(closet.x) || 1;
    this.pos.set(closet.x - s * 0.95, EYE, closet.z);
    this.yaw = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.pitch = 0;
    if (closet.d1 && closet.d2) { closet.d1.rotation.y = -1.2; closet.d2.rotation.y = 1.2; }
  }

  exitHide() {
    if (this.hideCloset) {
      const c = this.hideCloset;
      // step out toward the aisle
      const inward = c.x > 0 ? -1 : 1;
      this.pos.set(c.x + inward * 1.1, EYE, c.z);
      if (c.d1 && c.d2) { c.d1.rotation.y = 0; c.d2.rotation.y = 0; }
    }
    this.hiding = false;
    this.hideCloset = null;
  }

  nearestCloset() {
    let best = null, bd = 2.0;
    for (const c of this.level.closets) {
      const d = Math.hypot(c.x - this.pos.x, c.z - this.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt) {
    if (this.hiding) {
      // limited look while hiding
      this.camera.position.copy(this.pos);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.speed = 0;
      return;
    }

    const dir = new THREE.Vector3();
    if (this.keys['w']) dir.add(this.forward);
    if (this.keys['s']) dir.sub(this.forward);
    if (this.keys['d']) dir.add(this.right);
    if (this.keys['a']) dir.sub(this.right);
    if (this.touchMove && (this.touchMove.x || this.touchMove.y)) {
      dir.addScaledVector(this.forward, this.touchMove.y);
      dir.addScaledVector(this.right, this.touchMove.x);
    }
    if (dir.lengthSq() > 0) dir.normalize();

    const hasKey = this.keys['w'] || this.keys['a'] || this.keys['s'] || this.keys['d'];
    const hasTouch = this.touchMove && (this.touchMove.x || this.touchMove.y);
    const sprinting = (this.sprint && hasKey) || (this.touchSprint && hasTouch);
    const target = sprinting ? 7.4 : 4.2;
    const accel = 34;
    this.vel.x += (dir.x * target - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (dir.z * target - this.vel.z) * Math.min(1, accel * dt);
    if (dir.lengthSq() === 0) {
      this.vel.x *= Math.max(0, 1 - 12 * dt);
      this.vel.z *= Math.max(0, 1 - 12 * dt);
    }

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const resolved = this.resolve(this.pos.x, this.pos.z, nx, nz);
    this.pos.x = resolved.x;
    this.pos.z = resolved.z;

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // head bob
    if (this.speed > 0.6) {
      this.bob += dt * this.speed * 1.6;
      this.camera.position.y = EYE + Math.sin(this.bob * 2) * 0.045;
      this.footstep += dt * this.speed;
      if (this.footstep > 2.4) { this.footstep = 0; if (this.onFootstep) this.onFootstep(); }
    } else {
      this.camera.position.y += (EYE - this.camera.position.y) * Math.min(1, dt * 8);
    }

    this.pos.y = this.camera.position.y;
    this.camera.position.set(this.pos.x, this.camera.position.y, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const room = this.level.roomAt(this.pos.z);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.room = room;
      if (this.onRoomChange) this.onRoomChange(room);
    } else {
      this.room = room;
    }
  }

  resolve(ox, oz, nx, nz) {
    const L = this.level.L, W = this.level.W, N = this.level.N;
    const halfW = W / 2 - R;
    nx = Math.max(-halfW, Math.min(halfW, nx));

    const roomO = this.level.roomAt(oz);
    for (let k = roomO - 1; k <= roomO; k++) {
      if (k < 0 || k > N - 2) continue;
      const zb = -k * L - L / 2;
      const o = oz - zb;
      const n = nz - zb;
      if (o === 0) continue;
      if ((o > 0) !== (n > 0)) {
        const doorHalf = 3.2 / 2 - R;
        const open = this.level.doorOpen[k];
        if (!open || Math.abs(nx) > doorHalf) {
          nz = o > 0 ? zb + R : zb - R;
        }
      }
    }

    // solid furniture colliders
    for (const c of this.level.colliders) {
      if (nx > c.minX - R && nx < c.maxX + R && nz > c.minZ - R && nz < c.maxZ + R) {
        const dxL = nx - (c.minX - R);
        const dxR = (c.maxX + R) - nx;
        const dzL = nz - (c.minZ - R);
        const dzR = (c.maxZ + R) - nz;
        const m = Math.min(dxL, dxR, dzL, dzR);
        if (m === dxL) nx = c.minX - R;
        else if (m === dxR) nx = c.maxX + R;
        else if (m === dzL) nz = c.minZ - R;
        else nz = c.maxZ + R;
      }
    }
    return { x: nx, z: nz };
  }
}
