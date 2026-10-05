const $ = (s) => document.querySelector(s);

export const HUD = {
  el: {},
  init() {
    this.el.hud = $('#hud');
    this.el.room = $('#roomNumber');
    this.el.objective = $('#objective');
    this.el.hint = $('#hintbar');
    this.el.healthFill = $('#healthFill');
    this.el.healthText = $('#healthText');
    this.el.crosshair = $('#crosshair');
    this.el.interactHint = $('#interactHint');
    this.el.interactText = $('#interactText');
    this.el.players = $('#playersHud');
    this.el.chatLog = $('#chatLog');
    this.el.chatWrap = $('#chatInputWrap');
    this.el.chatInput = $('#chatInput');
    this.el.alert = $('#entityAlert');
    this.el.itemLight = $('#itemLight');
    this.el.itemKey = $('#itemKey');
    this.el.menu = $('#menu');
    this.el.lobby = $('#lobby');
    this.el.lobbyPlayers = $('#lobbyPlayers');
    this.el.roomCodeDisplay = $('#roomCodeDisplay');
    this.el.lockOverlay = $('#lockOverlay');
    this.el.result = $('#result');
    this.el.resultTitle = $('#resultTitle');
    this.el.resultSub = $('#resultSub');
    this.el.loading = $('#loading');
  },
  showHud(v) { this.el.hud.classList.toggle('hidden', !v); },
  screen(name) {
    for (const s of ['menu', 'lobby', 'lockOverlay', 'result', 'loading']) {
      this.el[s].classList.add('hidden');
    }
    if (name) this.el[name].classList.remove('hidden');
  },
  setHealth(h) {
    const v = Math.max(0, Math.round(h));
    this.el.healthFill.style.width = v + '%';
    this.el.healthText.textContent = v;
    this.el.healthFill.style.background = v > 50 ? 'linear-gradient(90deg,#8b1d1d,#d64b4b)' : v > 25 ? 'linear-gradient(90deg,#8b5a1d,#d6954b)' : 'linear-gradient(90deg,#5a0d0d,#b02020)';
  },
  setRoom(n, kind) {
    this.el.room.textContent = String(n).padStart(3, '0');
    const names = { lobby: 'THE LOBBY', library: 'THE LIBRARY', greenhouse: 'THE GREENHOUSE', electrical: 'THE ELECTRICAL ROOM', dining: 'THE DINING HALL', boss: 'THE GRUMBLE', exit: 'THE EXIT', hall: 'HOTEL CORRIDOR' };
    if (kind && names[kind]) this.el.objective.textContent = names[kind];
  },
  setObjective(t) { this.el.objective.textContent = t; },
  setLight(on) { this.el.itemLight.classList.toggle('active', on); },
  setKeys(n) { this.el.itemKey.querySelector('.k').textContent = n; this.el.itemKey.classList.toggle('active', n > 0); },
  setInteract(text) {
    if (!text) { this.el.interactHint.classList.add('hidden'); this.el.crosshair.classList.remove('active'); }
    else { this.el.interactText.textContent = text; this.el.interactHint.classList.remove('hidden'); this.el.crosshair.classList.add('active'); }
  },
  hint(text, ms = 3000) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('show');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => this.el.hint.classList.remove('show'), ms);
  },
  entityAlert(text, ms = 2500) {
    if (!text) { this.el.alert.classList.add('hidden'); return; }
    this.el.alert.textContent = text;
    this.el.alert.classList.remove('hidden');
    clearTimeout(this._alertT);
    if (ms) this._alertT = setTimeout(() => this.el.alert.classList.add('hidden'), ms);
  },
  setPlayers(list) {
    this.el.players.innerHTML = list.map((p) => `
      <div class="prow ${p.down ? 'down' : ''} ${p.hiding ? 'hide' : ''}">
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="php"><i style="width:${Math.max(0, p.health)}%"></i></span>
        <span class="dot"></span>
      </div>`).join('');
  },
  setLobbyPlayers(list, selfId) {
    this.el.lobbyPlayers.innerHTML = list.map((p) =>
      `<li>${p.name}${p.id === selfId ? ' <span style="opacity:.5">(you)</span>' : ''}</li>`
    ).join('') || '<li style="opacity:.5">no guests yet</li>';
  },
  setRoomCode(code) {
    if (this.el.roomCodeDisplay) this.el.roomCodeDisplay.textContent = code || '----';
  },
  chat(msg) {
    const div = document.createElement('div');
    if (msg.system) { div.className = 'sys'; div.textContent = `— ${escapeHtml(msg.text)} —`; }
    else { div.textContent = ''; const b = document.createElement('b'); b.textContent = msg.name + ': '; b.style.color = '#e6c874'; div.append(b, document.createTextNode(msg.text)); }
    this.el.chatLog.append(div);
    while (this.el.chatLog.children.length > 6) this.el.chatLog.removeChild(this.el.chatLog.firstChild);
  },
  showResult(win) {
    this.el.resultTitle.textContent = win ? 'YOU ESCAPED' : 'THE HOTEL CLAIMS YOU';
    this.el.resultTitle.style.color = win ? '#d8b25a' : '#c23b3b';
    this.el.resultSub.textContent = win ? 'The elevator doors close behind you.' : 'No guests remain.';
    this.screen('result');
  },
};

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
