// On-screen mobile controls: virtual joystick, drag-to-look, action buttons.
const DEAD = 0.16;

export function isTouchDevice() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced === '1') return true;
  if (forced === '0') return false;
  return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || (navigator.msMaxTouchPoints > 0);
}

export class TouchControls {
  constructor(opts) {
    this.onMove = opts.onMove || (() => {});
    this.onLook = opts.onLook || (() => {});
    this.onInteract = opts.onInteract || (() => {});
    this.onLight = opts.onLight || (() => {});
    this.onSprint = opts.onSprint || (() => {});
    this.onChat = opts.onChat || (() => {});
    this.enabled = false;
    this.joyId = null;
    this.lookId = null;
    this.sprinting = false;
    this.root = null;
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touchLayer';
    root.className = 'hidden';
    root.innerHTML = `
      <div id="lookZone"></div>
      <div id="joyZone"><div id="joyBase"><div id="joyKnob"></div></div></div>
      <div id="touchBtns">
        <div class="tbtnRow">
          <button class="tbtn small" id="tbChat" aria-label="Chat">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V5a2 2 0 0 1 2-2z"/></svg>
          </button>
          <button class="tbtn small" id="tbSprint" aria-label="Sprint">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>
          </button>
        </div>
        <button class="tbtn" id="tbLight" aria-label="Flashlight">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2h6v3l-1 1v2l3 2.5V12H7v-1.5L10 8V6L9 5z"/><rect x="9" y="14" width="6" height="8" rx="1"/></svg>
        </button>
        <button class="tbtn big" id="tbUse" aria-label="Interact">E</button>
      </div>`;
    document.getElementById('app').appendChild(root);
    this.root = root;
    this.lookZone = root.querySelector('#lookZone');
    this.joyZone = root.querySelector('#joyZone');
    this.joyBase = root.querySelector('#joyBase');
    this.joyKnob = root.querySelector('#joyKnob');
    this.tbSprint = root.querySelector('#tbSprint');
    this.bind();
  }

  bind() {
    const jz = this.joyZone;
    jz.addEventListener('pointerdown', (e) => {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      jz.setPointerCapture(e.pointerId);
      this.joyCenter = this.centerOf(this.joyBase);
      this.updateJoy(e);
      e.preventDefault();
    });
    jz.addEventListener('pointermove', (e) => { if (e.pointerId === this.joyId) { this.updateJoy(e); e.preventDefault(); } });
    const joyEnd = (e) => { if (e.pointerId !== this.joyId) return; this.joyId = null; this.resetJoy(); };
    jz.addEventListener('pointerup', joyEnd);
    jz.addEventListener('pointercancel', joyEnd);

    const lz = this.lookZone;
    lz.addEventListener('pointerdown', (e) => {
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      lz.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    lz.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.onLook(dx, dy);
      e.preventDefault();
    });
    const lookEnd = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    lz.addEventListener('pointerup', lookEnd);
    lz.addEventListener('pointercancel', lookEnd);

    this.tap('#tbUse', () => this.onInteract());
    this.tap('#tbLight', () => this.onLight());
    this.tap('#tbSprint', () => this.toggleSprint());
    this.tap('#tbChat', () => this.onChat());

    // block context menu / gestures on the control layer
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tap(sel, fn) {
    const el = this.root.querySelector(sel);
    el.addEventListener('pointerdown', (e) => { el.classList.add('down'); fn(); e.preventDefault(); e.stopPropagation(); });
    const up = (e) => { el.classList.remove('down'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }

  updateJoy(e) {
    const c = this.joyCenter;
    let dx = e.clientX - c.x;
    let dy = e.clientY - c.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const max = c.r;
    const clamped = Math.min(dist, max);
    this.joyKnob.style.transform = `translate(${(dx / dist) * clamped}px, ${(dy / dist) * clamped}px)`;
    const mag = clamped / max;
    if (mag < DEAD) { this.onMove({ x: 0, y: 0 }); return; }
    const nx = dx / dist, ny = dy / dist;
    this.onMove({ x: nx * mag, y: -ny * mag });
  }

  resetJoy() {
    this.joyKnob.style.transform = 'translate(0px, 0px)';
    this.onMove({ x: 0, y: 0 });
  }

  toggleSprint() {
    this.sprinting = !this.sprinting;
    this.tbSprint.classList.toggle('on', this.sprinting);
    this.onSprint(this.sprinting);
  }

  setLight(on) { this.root.querySelector('#tbLight').classList.toggle('on', on); }

  show(v) {
    this.enabled = v;
    this.root.classList.toggle('hidden', !v);
    document.body.classList.toggle('touch-mode', v);
    if (!v) { this.resetJoy(); this.joyId = null; this.lookId = null; }
  }

  // When an external overlay (chat input) is focused, stop movement.
  release() { this.resetJoy(); this.joyId = null; this.lookId = null; }
}
