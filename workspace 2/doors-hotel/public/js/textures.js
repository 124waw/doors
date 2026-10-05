import * as THREE from 'three';

const cache = new Map();
function makeCanvas(w = 256, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTex(c, repX = 1, repY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function cached(name, fn, rx, ry) {
  const key = name + rx + 'x' + ry;
  if (!cache.has(key)) cache.set(key, toTex(fn(), rx, ry));
  return cache.get(key);
}

// Ornate damask wallpaper on a dark crimson ground.
export function wallpaper(base = '#5e1b1b', accent = '#c9a24a', rx = 1, ry = 1) {
  return cached('wall' + base + accent, () => {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    // subtle vertical stripes
    x.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 256; i += 32) x.fillRect(i, 0, 2, 256);
    x.strokeStyle = accent; x.globalAlpha = 0.5; x.lineWidth = 1.4;
    const motif = (cx, cy, s) => {
      x.beginPath();
      x.moveTo(cx, cy - s);
      x.bezierCurveTo(cx + s, cy - s, cx + s, cy + s, cx, cy + s);
      x.bezierCurveTo(cx - s, cy + s, cx - s, cy - s, cx, cy - s);
      x.stroke();
      x.beginPath(); x.arc(cx, cy, s * 0.32, 0, Math.PI * 2); x.stroke();
    };
    for (let gx = 0; gx < 4; gx++)
      for (let gy = 0; gy < 4; gy++)
        motif(32 + gx * 64, 32 + gy * 64, 15);
    // grain
    x.globalAlpha = 0.08;
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    x.globalAlpha = 1;
    return c;
  }, rx, ry);
}

// Rich patterned carpet.
export function carpet(rx = 4, ry = 8) {
  return cached('carpet', () => {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#4a1414'; x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#7a2222'; x.fillRect(16, 16, 224, 224);
    x.strokeStyle = '#c9a24a'; x.lineWidth = 3; x.strokeRect(24, 24, 208, 208);
    x.strokeStyle = '#8a5a2a'; x.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      x.beginPath();
      x.arc(128, 128, 30 + i * 14, 0, Math.PI * 2);
      x.stroke();
    }
    x.globalAlpha = 0.15;
    for (let i = 0; i < 4000; i++) {
      x.fillStyle = Math.random() > 0.5 ? '#000' : '#caa';
      x.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    x.globalAlpha = 1;
    return c;
  }, rx, ry);
}

// Polished marble for the grand lobby.
export function marble(rx = 4, ry = 4) {
  return cached('marble', () => {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#efe6cf'); g.addColorStop(1, '#cdbf9c');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(90,70,40,.5)';
    for (let i = 0; i < 26; i++) {
      x.beginPath();
      let px = Math.random() * 256, py = Math.random() * 256;
      x.moveTo(px, py);
      for (let j = 0; j < 6; j++) {
        px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 60;
        x.lineTo(px, py);
      }
      x.lineWidth = Math.random() * 1.5 + 0.2; x.stroke();
    }
    x.strokeStyle = 'rgba(60,45,25,.6)'; x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
    return c;
  }, rx, ry);
}

// Dark varnished wood for doors and furniture.
export function wood(rx = 1, ry = 1) {
  return cached('wood', () => {
    const c = makeCanvas(128, 256), x = c.getContext('2d');
    x.fillStyle = '#3a1f0e'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 220; i++) {
      x.strokeStyle = `rgba(${60 + Math.random() * 60},${30 + Math.random() * 30},10,${Math.random() * .5})`;
      x.lineWidth = Math.random() * 3 + 0.5;
      x.beginPath();
      const yy = Math.random() * 256; x.moveTo(0, yy);
      x.bezierCurveTo(42, yy + (Math.random() - .5) * 14, 86, yy + (Math.random() - .5) * 14, 128, yy);
      x.stroke();
    }
    return c;
  }, rx, ry);
}

// Gold metal trim / handles.
export function gold(rx = 1, ry = 1) {
  return cached('gold', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, '#8a6f2e'); g.addColorStop(0.5, '#e6c874'); g.addColorStop(1, '#8a6f2e');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.globalAlpha = 0.25;
    for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() > .5 ? '#fff' : '#000'; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    x.globalAlpha = 1;
    return c;
  }, rx, ry);
}

export function concrete(rx = 2, ry = 2) {
  return cached('concrete', () => {
    const c = makeCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#3b3b40'; x.fillRect(0, 0, 256, 256);
    x.globalAlpha = 0.25;
    for (let i = 0; i < 6000; i++) { x.fillStyle = Math.random() > .5 ? '#000' : '#8a8a90'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    x.globalAlpha = 1;
    return c;
  }, rx, ry);
}

export function ceiling(rx = 2, ry = 2) {
  return cached('ceil', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#d8ccae'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(120,100,70,.5)'; x.lineWidth = 2;
    x.strokeRect(8, 8, 112, 112);
    x.beginPath(); x.arc(64, 64, 26, 0, Math.PI * 2); x.stroke();
    x.globalAlpha = .12;
    for (let i = 0; i < 1500; i++) { x.fillStyle = '#000'; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
    x.globalAlpha = 1;
    return c;
  }, rx, ry);
}

// Framed painting (randomized each call).
export function painting(i = 0) {
  const c = makeCanvas(128, 160), x = c.getContext('2d');
  x.fillStyle = '#241408'; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#d8b25a'; x.fillRect(6, 6, 116, 148);
  x.fillStyle = ['#2b3a2a', '#2a2438', '#3a2a1a', '#22303a'][i % 4];
  x.fillRect(12, 12, 104, 136);
  // abstract landscape
  for (let k = 0; k < 3; k++) {
    x.fillStyle = ['#4a5a3a', '#38485a', '#5a4a2a'][(i + k) % 3];
    x.globalAlpha = 0.7;
    x.beginPath();
    x.ellipse(30 + (i * 13 + k * 37) % 80, 60 + k * 30, 30, 14, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}

export function foliage(rx = 1, ry = 1) {
  return cached('foliage', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#173015'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      x.fillStyle = `hsl(${95 + Math.random() * 40},${40 + Math.random() * 30}%,${15 + Math.random() * 28}%)`;
      x.beginPath();
      x.ellipse(Math.random() * 128, Math.random() * 128, 4 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * Math.PI, 0, Math.PI * 2);
      x.fill();
    }
    return c;
  }, rx, ry);
}

export function emissivePanel() {
  return cached('panel', () => {
    const c = makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 70);
    g.addColorStop(0, '#fff6dd'); g.addColorStop(1, '#c9a24a');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }, 1, 1);
}

// Room number plaque texture.
export function numberPlate(num) {
  const c = makeCanvas(128, 96), x = c.getContext('2d');
  x.fillStyle = '#1a1208'; x.fillRect(0, 0, 128, 96);
  x.strokeStyle = '#e6c874'; x.lineWidth = 4; x.strokeRect(5, 5, 118, 86);
  x.fillStyle = '#f2dfa8';
  x.font = 'bold 54px Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(num).padStart(3, '0'), 64, 50);
  return new THREE.CanvasTexture(c);
}

export const MAT = {};
export function preloadMaterials() {
  MAT.wallRed = new THREE.MeshStandardMaterial({ map: wallpaper('#5e1b1b', '#c9a24a', 2, 1), roughness: 0.95 });
  MAT.wallGreen = new THREE.MeshStandardMaterial({ map: wallpaper('#1d3a2a', '#b9973f', 2, 1), roughness: 0.95 });
  MAT.wallBlue = new THREE.MeshStandardMaterial({ map: wallpaper('#20283f', '#c9a24a', 2, 1), roughness: 0.95 });
  MAT.carpet = new THREE.MeshStandardMaterial({ map: carpet(6, 12), roughness: 1 });
  MAT.marble = new THREE.MeshStandardMaterial({ map: marble(4, 4), roughness: 0.35, metalness: 0.15 });
  MAT.wood = new THREE.MeshStandardMaterial({ map: wood(1, 2), roughness: 0.7 });
  MAT.woodLight = new THREE.MeshStandardMaterial({ map: wood(1, 1), roughness: 0.6, color: 0xbfa070 });
  MAT.gold = new THREE.MeshStandardMaterial({ map: gold(1, 1), roughness: 0.3, metalness: 0.85 });
  MAT.concrete = new THREE.MeshStandardMaterial({ map: concrete(2, 2), roughness: 1 });
  MAT.ceiling = new THREE.MeshStandardMaterial({ map: ceiling(3, 3), roughness: 0.9, color: 0x9a8a6a });
  MAT.foliage = new THREE.MeshStandardMaterial({ map: foliage(1, 1), roughness: 1 });
  MAT.panel = new THREE.MeshStandardMaterial({ map: emissivePanel(), emissive: 0xffe6a8, emissiveIntensity: 1.2, emissiveMap: emissivePanel() });
}
