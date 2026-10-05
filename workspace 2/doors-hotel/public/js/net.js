export class Net {
  constructor() {
    this.socket = window.io();
    this.id = null;
    this.socket.on('hello', (d) => { this.id = d.id; });
  }
  on(ev, fn) { this.socket.on(ev, fn); }
  emit(ev, data) { this.socket.emit(ev, data); }
}
