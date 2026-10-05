import * as THREE from 'three';
import { preloadMaterials } from './textures.js';
import { Level } from './world.js';
import { Player } from './player.js';
import { EntityView, RemotePlayers } from './entities.js';
import { Net } from './net.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { TouchControls, isTouchDevice } from './touch.js';

const DOOR_W = 3.2;

class Game {
  constructor() {
    HUD.init();
    this.net = new Net();
    this.audio = new Audio();
    this.clock = new THREE.Clock();
    this.players = [];
    this.selfId = null;
    this.status = 'menu';
    this.paused = false;
    this.keysPicked = new Set();
    this.darkAmount = 1;
    this.chatOpen = false;
    this.rushRoom = null;
    this.down = false;
    this.lastSend = 0;
    this.lastDownCheck = 0;

    this.initThree();
    this.bindInput();
    this.bindNetwork();
    this.initTouch();
    this.animate();
  }

  initTouch() {
    this.isTouch = isTouchDevice();
    if (!this.isTouch) return;
    this.touch = new TouchControls({
      onMove: (v) => { if (this.player) this.player.touchMove = v; },
      onLook: (dx, dy) => { if (this.player && !this.paused) this.player.onMouseMove(dx * 1.7, dy * 1.7); },
      onInteract: () => { if (this.status === 'playing') this.interact(); },
      onLight: () => { if (this.status === 'playing') this.toggleFlash(); },
      onSprint: (v) => { if (this.player) this.player.touchSprint = v; },
      onChat: () => { if (this.status === 'playing') this.toggleChat(true); },
    });
    HUD.hint('Touch controls enabled');
  }

  initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05050a);
    this.scene.fog = new THREE.FogExp2(0x05050a, 0.022);

    this.camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 240);
    this.camera.rotation.order = 'YXZ';

    this.hemi = new THREE.HemisphereLight(0xffe6c0, 0x140a08, 0.6);
    this.scene.add(this.hemi);
    this.playerLight = new THREE.PointLight(0xffd9a0, 0.7, 18, 2);
    this.scene.add(this.playerLight);

    this.flash = new THREE.SpotLight(0xfff2d0, 0, 60, Math.PI / 7, 0.45, 1.4);
    this.flash.position.set(0, 0, 0);
    this.flashTarget = new THREE.Object3D();
    this.flashTarget.position.set(0, 0, -1);
    this.camera.add(this.flash);
    this.camera.add(this.flashTarget);
    this.flash.target = this.flashTarget;
    this.scene.add(this.camera);

    this.lighter = new THREE.PointLight(0xff9a40, 0, 9, 2);
    this.camera.add(this.lighter);

    this.remote = new RemotePlayers(this.scene);
  }

  buildLevel(floor) {
    if (this.level) this.level.dispose();
    this.floor = floor;
    this.level = new Level(this.scene, floor);
    this.player = new Player(this.camera, this.level);
    this.player.onFootstep = () => this.audio.footstep(this.isDark());
    this.player.onRoomChange = (r) => this.onRoomChange(r);
    this.entities = new EntityView(this.scene, this.level);
    this.keysPicked.clear();
    this.remote.clear();
    HUD.setKeys(0);
  }

  bindInput() {
    const canvas = document.getElementById('scene');
    canvas.addEventListener('click', () => {
      if (this.status === 'playing' && !this.chatOpen) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!this.isTouch) this.paused = !locked;
      if (this.status === 'playing' && !this.chatOpen && !this.isTouch) {
        HUD.screen(locked ? null : 'lockOverlay');
        HUD.showHud(true);
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.player && !this.paused && !this.chatOpen) {
        this.player.onMouseMove(e.movementX, e.movementY);
      }
    });

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    document.getElementById('joinBtn').addEventListener('click', () => {
      const name = document.getElementById('nameInput').value.trim() || 'Guest';
      const code = document.getElementById('codeInput').value.trim();
      this.audio.init(); this.audio.resume();
      this.net.emit('join', { name, code });
    });
    document.getElementById('createBtn').addEventListener('click', () => {
      const name = document.getElementById('nameInput').value.trim() || 'Guest';
      this.audio.init(); this.audio.resume();
      this.net.emit('create', name);
    });
    document.getElementById('startBtn').addEventListener('click', () => {
      this.audio.resume();
      this.net.emit('start');
    });
    document.getElementById('againBtn').addEventListener('click', () => {
      this.net.emit('restart');
    });
    document.getElementById('copyCodeBtn').addEventListener('click', () => {
      const code = this.roomCode || '';
      const done = () => HUD.hint('Room code copied', 1800);
      if (navigator.clipboard && code) navigator.clipboard.writeText(code).then(done).catch(done);
      else done();
    });
    const submitJoin = () => document.getElementById('joinBtn').click();
    document.getElementById('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });
    document.getElementById('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitJoin(); });
  }

  onKey(e, down) {
    if (this.chatOpen) {
      if (e.key === 'Enter' && down) this.sendChat();
      if (e.key === 'Escape') this.toggleChat(false);
      return;
    }
    const k = e.key.toLowerCase();
    if (down && k === 'enter') { this.toggleChat(true); return; }
    if (this.player) {
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') this.player.keys[k] = down;
      if (k === 'shift') this.player.sprint = down;
      if (down && k === 'f' && this.status === 'playing') this.toggleFlash();
      if (down && k === 'e' && this.status === 'playing') this.interact();
    }
  }

  toggleChat(open) {
    this.chatOpen = open;
    HUD.el.chatWrap.classList.toggle('hidden', !open);
    if (this.touch) this.touch.show(!open && this.status === 'playing');
    if (open) {
      document.exitPointerLock?.();
      setTimeout(() => HUD.el.chatInput.focus(), 50);
    } else {
      HUD.el.chatInput.value = '';
      HUD.el.chatInput.blur();
      if (this.status === 'playing' && !this.isTouch) document.getElementById('scene').requestPointerLock();
    }
  }

  toggleFlash() {
    const p = this.player;
    p.light = !p.light;
    HUD.setLight(p.light);
    if (this.touch) this.touch.setLight(p.light);
    this.audio.blip(p.light ? 1200 : 700, 0.06, 'square', 0.15);
  }

  sendChat() {
    const v = HUD.el.chatInput.value.trim();
    if (v) this.net.emit('chat', v);
    this.toggleChat(false);
  }

  bindNetwork() {
    this.net.on('init', (d) => {
      this.selfId = d.selfId;
      this.roomCode = d.code;
      this.players = d.players;
      this.status = d.status;
      this.floorData = d.floor;
      HUD.screen('lobby');
      HUD.setRoomCode(d.code);
      HUD.setLobbyPlayers(this.players, this.selfId);
      if (d.status === 'playing') this.beginPlay(d.floor);
    });
    this.net.on('players', (list) => {
      this.players = list;
      HUD.setPlayers(list);
      HUD.setLobbyPlayers(list, this.selfId);
      this.syncSelf(list);
    });
    this.net.on('chat', (m) => HUD.chat(m));
    this.net.on('full', () => { document.getElementById('menuMsg').textContent = 'That room is full (4 guests max).'; });
    this.net.on('noRoom', (d) => { document.getElementById('menuMsg').textContent = `Room ${d.code || ''} not found. Check the code or create one.`; });
    this.net.on('gameState', (d) => {
      this.status = d.status;
      if (d.status === 'playing') this.beginPlay(d.floor || this.floorData);
      if (d.status === 'won') { HUD.showResult(true); if (this.touch) this.touch.show(false); document.exitPointerLock?.(); }
      if (d.status === 'lost') { HUD.showResult(false); if (this.touch) this.touch.show(false); document.exitPointerLock?.(); }
      if (d.status === 'lobby') { HUD.screen('lobby'); HUD.showHud(false); if (this.touch) this.touch.show(false); }
    });
    this.net.on('doorUnlocked', (d) => {
      if (this.level) { this.level.setDoorOpen(d.door, true); this.audio.door(); HUD.setObjective('The door is open. Move on.'); }
    });
    this.net.on('keyPicked', (d) => {
      this.keysPicked.add(d.door);
      if (this.floor) this.floor.keys[d.door] && (this.floor.keys[d.door].taken = true);
      if (this.level) {
        const g = this.level.keys.get(d.door);
        if (g) { this.level.group.remove(g); this.level.keys.delete(d.door); }
      }
      HUD.setKeys(1);
      HUD.hint('Key found — the next door is unlocked', 3500);
      this.audio.key();
    });
    this.net.on('reveal', () => {});
    this.net.on('entity', (d) => this.onEntity(d));
    this.net.on('entityMove', (d) => this.onEntityMove(d));
    this.net.on('playerDown', (d) => {
      this.audio.screech();
      if (d.id === this.selfId) { this.down = true; HUD.entityAlert('YOU ARE DOWN', 0); }
      else HUD.hint('A guest has fallen — press E nearby to revive');
    });
    this.net.on('revived', (d) => {
      if (d.id === this.selfId) { this.down = false; HUD.entityAlert(null); HUD.hint('Revived!', 2000); }
      else HUD.hint('A guest was revived.');
      this.audio.blip(660, 0.3, 'sine', 0.25);
    });
  }

  syncSelf(list) {
    const self = list.find((p) => p.id === this.selfId);
    if (self) {
      HUD.setHealth(self.health);
      if (self.down && !this.down) { this.down = true; HUD.entityAlert('YOU ARE DOWN', 0); }
    }
  }

  beginPlay(floor) {
    if (!floor) return;
    if (!this.level || this.level.floor !== floor) this.buildLevel(floor);
    this.status = 'playing';
    this.down = false;
    HUD.screen(null);
    HUD.showHud(true);
    HUD.setRoom(this.player.room, this.floor.rooms[this.player.room].kind);
    HUD.setObjective('Find the key and open the door');
    this.audio.resume();
    if (this.touch) { this.touch.show(true); this.player.touchMove = null; }
    else { document.getElementById('scene').requestPointerLock(); }
  }

  onRoomChange(room) {
    const r = this.floor.rooms[room];
    HUD.setRoom(room + 1, r.kind);
    const locked = this.floor.lock[room];
    if (locked && !this.level.doorOpen[room]) HUD.setObjective('Find the key and open the door');
    else HUD.setObjective('Proceed to the next room');
    this.audio.setTension(r.dark ? 0.6 : 0.2);
    if (r.kind === 'library') { this.entities.spawnFigure(room); HUD.hint('The Figure is here. Stay quiet — no running, no flashlight.', 5000); }
    if (r.kind === 'boss') { HUD.hint('RUN. Reach the far door.', 5000); }
    if (r.kind === 'exit') { HUD.hint('The elevator. You made it.', 5000); }
  }

  onEntity(d) {
    if (d.type === 'rush') {
      if (d.phase === 'warn') {
        this.audio.growl();
        this.rushRoom = d.room;
        HUD.entityAlert('HIDE', 2600);
        HUD.hint('Something is coming. Get in a wardrobe!', 2600);
      } else if (d.phase === 'sweep') {
        this.entities.spawnRush(d.room);
        this.audio.rushSweep();
      } else if (d.phase === 'end') {
        this.entities.clearRush();
        this.rushRoom = null;
      }
    } else if (d.type === 'grumble' && d.phase === 'wake') {
      this.entities.spawnGrumble(d.room);
      this.audio.growl();
      HUD.entityAlert('RUN', 3000);
    }
  }

  onEntityMove(d) {
    if (d.type === 'figure') {
      if (!this.entities.figure.has(d.room)) this.entities.spawnFigure(d.room);
      this.entities.moveFigure(d.room, d.x, d.z);
      const dist = this.player ? Math.hypot(this.player.pos.x - d.x, this.player.pos.z - (this.level.centerZ(d.room) + d.z)) : 99;
      this.audio.setTension(Math.max(0, Math.min(1, 1 - dist / 16)) * 0.9 + 0.1);
    } else if (d.type === 'grumble') {
      this.entities.moveGrumble(d.room, d.x, d.z);
    }
  }

  interact() {
    const p = this.player;
    if (!p || this.down) return;
    if (p.hiding) { p.exitHide(); HUD.setInteract(null); return; }
    const act = this.scanInteract();
    if (!act) return;
    if (act.type === 'closet') { p.enterHide(act.closet); HUD.setInteract(null); this.audio.creak(); }
    else if (act.type === 'key') { this.net.emit('pickupKey', { door: act.door }); }
    else if (act.type === 'door') { this.net.emit('interact', { type: 'door', door: act.door }); }
    else if (act.type === 'revive') { this.net.emit('revive', { target: act.id }); }
  }

  scanInteract() {
    const p = this.player;
    const W = this.level.W;
    const room = p.room;
    // revive down teammate
    for (const q of this.players) {
      if (q.id === this.selfId || !q.down) continue;
      if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 2.6) return { type: 'revive', id: q.id, label: `Revive ${q.name}` };
    }
    // key
    for (const [door, g] of this.level.keys) {
      if (Math.hypot(g.position.x - p.pos.x, g.position.z - p.pos.z) < 2.6) return { type: 'key', door, label: 'Pick up the key' };
    }
    // closet
    const c = p.nearestCloset();
    if (c) return { type: 'closet', closet: c, label: 'Hide in wardrobe' };
    // door ahead (far boundary of current room)
    const zb = -room * this.level.L - this.level.L / 2;
    const dz = p.pos.z - zb;
    if (dz < 3.2 && dz > -1.0 && Math.abs(p.pos.x) < W / 2) {
      const open = this.level.doorOpen[room];
      if (open) return { type: 'door', door: room, label: 'Open the door' };
      if (!this.floor.lock[room]) return { type: 'door', door: room, label: 'Open the door' };
      if (this.keysPicked.has(room)) return { type: 'door', door: room, label: 'Unlock the door' };
      return { type: 'locked', room, label: 'Locked — find the key' };
    }
    return null;
  }

  isDark() {
    if (!this.floor) return false;
    return !!this.floor.rooms[this.player?.room ?? 0]?.dark;
  }

  updateLighting(dt) {
    const dark = this.isDark();
    const target = dark ? 0.1 : 0.95;
    this.darkAmount += (target - this.darkAmount) * Math.min(1, dt * 2.5);
    let hemi = this.darkAmount;
    if (this.entities && this.entities.rush) hemi *= (0.3 + Math.random() * 0.7);
    if (this.player && this.player.hiding) hemi *= 0.3;
    this.hemi.intensity = hemi;
    this.playerLight.intensity = dark ? 0.22 : 1.0;
    if (this.player) this.playerLight.position.set(this.player.pos.x, 2.6, this.player.pos.z);

    const on = this.player && this.player.light;
    const targetF = on ? (dark ? 4.5 : 2.4) : 0;
    this.flash.intensity += (targetF - this.flash.intensity) * Math.min(1, dt * 10);
    this.scene.fog.density = dark ? 0.03 : 0.014;
  }

  sendState(now) {
    if (now - this.lastSend < 66) return;
    this.lastSend = now;
    const p = this.player;
    this.net.emit('state', { x: p.pos.x, y: p.camera.position.y, z: p.pos.z, ry: p.yaw, room: p.room, hiding: p.hiding, light: p.light, speed: p.speed });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.status === 'playing' && this.player) {
      if (this.down) { this.player.touchMove = null; this.player.keys = {}; this.player.vel.set(0, 0, 0); }
      this.player.update(dt);
      this.level.update(dt, this.player.pos, this.player.room);
      if (this.entities) this.entities.updateRush(dt);
      this.updateLighting(dt);
      this.remote.update(this.players, this.selfId);
      this.updateInteractHint();
      this.sendState(performance.now());
      this.checkDanger();
    } else if (this.level) {
      this.level.update(dt, this.player ? this.player.pos : { x: 0, y: 0, z: 0 }, this.player ? this.player.room : 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateInteractHint() {
    if (this.player.down) { HUD.setInteract(null); return; }
    if (this.player.hiding) { HUD.setInteract('Leave wardrobe'); return; }
    const act = this.scanInteract();
    HUD.setInteract(act ? act.label : null);
  }

  checkDanger() {
    const now = performance.now();
    if (now - this.lastDownCheck < 500) return;
    this.lastDownCheck = now;
    const self = this.players.find((p) => p.id === this.selfId);
    if (self && self.health < 45 && !self.down) this.audio.heartbeat();
  }
}

window.addEventListener('load', () => {
  HUD.init();
  preloadMaterials();
  if (HUD.el.loading) HUD.screen('loading');
  setTimeout(() => {
    HUD.screen('menu');
    window.game = new Game();
  }, 50);
});
