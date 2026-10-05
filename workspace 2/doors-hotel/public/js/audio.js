// Procedural audio — no external assets.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  startAmbient() {
    // low drone + noise for hotel atmosphere
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.connect(this.master);
    this.ambient = g;

    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 48;
    const og = ctx.createGain(); og.gain.value = 0.5;
    osc.connect(og); og.connect(g); osc.start();

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine'; osc2.frequency.value = 72;
    const og2 = ctx.createGain(); og2.gain.value = 0.2;
    osc2.connect(og2); og2.connect(g); osc2.start();

    // filtered noise
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const ng = ctx.createGain(); ng.gain.value = 0.15;
    noise.connect(lp); lp.connect(ng); ng.connect(g); noise.start();

    g.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 4);
  }

  setTension(v) {
    if (this.ambient) this.ambient.gain.value = 0.25 + v * 0.5;
  }

  blip(freq, dur, type = 'sine', vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  footstep(dark) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(dark ? 90 : 150, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.12);
  }

  door() { this.blip(220, 0.5, 'sawtooth', 0.15); this.creak(); }
  creak() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(120 + i * 30, t + i * 0.12);
      o.frequency.linearRampToValueAtTime(90 + i * 30, t + i * 0.12 + 0.1);
      g.gain.setValueAtTime(0.06, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.12);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.14);
    }
  }

  key() { this.blip(880, 0.12, 'square', 0.2); setTimeout(() => this.blip(1320, 0.15, 'square', 0.2), 90); }

  growl() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(38, t + 1.6);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0, t + 1.8);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.9);
  }

  screech() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.55);
  }

  rushSweep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t);
  }

  heartbeat() {
    if (!this.ctx) return;
    this.blip(60, 0.15, 'sine', 0.4);
    setTimeout(() => this.blip(52, 0.2, 'sine', 0.3), 200);
  }
}
