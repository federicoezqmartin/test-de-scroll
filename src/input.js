// Entrada: teclado + mouse en escritorio, dos palancas en pantallas táctiles.
const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const SUPER_KEYS = new Set(['Space', 'KeyE', 'KeyQ']);

export class Input {
  constructor({ canvas, stick, btnAttack, btnSuper, onPause }) {
    this.enabled = false;
    this.touch = false;
    this.move = { x: 0, z: 0 };
    this.ndc = { x: 0, y: -0.2 };
    this.fire = false;
    this.superHeld = false;
    this.preview = null;
    this.events = [];
    this.keys = new Set();
    this.stick = stick;
    this.btns = { attack: btnAttack, super: btnSuper };
    this.t = { move: null, attack: null, super: null };
    this.onPause = onPause;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) onPause(); return; }
      if (!this.enabled) return;
      if (KEYS[e.code]) this.setTouch(false);
      if (KEYS[e.code] || SUPER_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (SUPER_KEYS.has(e.code)) this.superHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (SUPER_KEYS.has(e.code) && this.superHeld) {
        this.superHeld = false;
        if (this.enabled) this.events.push({ kind: 'super' });
      }
    });
    window.addEventListener('blur', () => this.reset());

    window.addEventListener('mousemove', (e) => {
      this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.superHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2 && this.superHeld) {
        this.superHeld = false;
        if (this.enabled) this.events.push({ kind: 'super' });
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const opt = { passive: false };
    document.addEventListener('touchstart', (e) => this.onTouchStart(e), opt);
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), opt);
    document.addEventListener('touchend', (e) => this.onTouchEnd(e), opt);
    document.addEventListener('touchcancel', (e) => this.onTouchEnd(e), opt);
  }

  setTouch(on) {
    if (this.touch === on) return;
    this.touch = on;
    document.body.classList.toggle('touch', on);
  }

  reset() {
    this.keys.clear();
    this.fire = false;
    this.superHeld = false;
    this.preview = null;
    this.move.x = this.move.z = 0;
    this.t.move = this.t.attack = this.t.super = null;
    this.stick.classList.remove('on');
    for (const b of Object.values(this.btns)) b.classList.remove('aim');
    this.events.length = 0;
  }

  take() {
    const e = this.events;
    this.events = [];
    return e;
  }

  update() {
    if (this.touch) return;
    let x = 0, z = 0;
    for (const k of this.keys) {
      const v = KEYS[k];
      if (v) { x += v[0]; z += v[1]; }
    }
    const l = Math.hypot(x, z);
    this.move.x = l ? x / l : 0;
    this.move.z = l ? z / l : 0;
  }

  onTouchStart(e) {
    this.setTouch(true);
    if (!this.enabled) return;
    if (e.target.closest?.('button')) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const kind = el?.closest?.('#btn-attack') ? 'attack' : el?.closest?.('#btn-super') ? 'super' : null;
      if (kind) {
        if (!this.t[kind]) this.t[kind] = { id: t.identifier, sx: t.clientX, sy: t.clientY };
      } else if (!this.t.move && t.clientX < window.innerWidth * 0.55) {
        this.t.move = { id: t.identifier, sx: t.clientX, sy: t.clientY };
        this.stick.style.left = t.clientX + 'px';
        this.stick.style.top = t.clientY + 'px';
        this.stick.classList.add('on');
        this.stick.firstElementChild.style.transform = 'translate(-50%,-50%)';
      }
    }
  }

  onTouchMove(e) {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const m = this.t.move;
      if (m && m.id === t.identifier) {
        let dx = t.clientX - m.sx, dy = t.clientY - m.sy;
        const l = Math.hypot(dx, dy), max = 52;
        if (l > max) { dx *= max / l; dy *= max / l; }
        const dead = l < 8;
        this.move.x = dead ? 0 : dx / max;
        this.move.z = dead ? 0 : dy / max;
        this.stick.firstElementChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      for (const kind of ['attack', 'super']) {
        const a = this.t[kind];
        if (!a || a.id !== t.identifier) continue;
        let dx = t.clientX - a.sx, dy = t.clientY - a.sy;
        const l = Math.hypot(dx, dy), max = 64;
        const knob = this.btns[kind].firstElementChild;
        if (l > 14) {
          this.preview = { kind, x: dx / l, z: dy / l, mag: Math.min(1, l / max) };
          if (l > max) { dx *= max / l; dy *= max / l; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.btns[kind].classList.add('aim');
        } else {
          if (this.preview?.kind === kind) this.preview = null;
          knob.style.transform = '';
          this.btns[kind].classList.remove('aim');
        }
      }
    }
  }

  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (this.t.move && this.t.move.id === t.identifier) {
        this.t.move = null;
        this.move.x = this.move.z = 0;
        this.stick.classList.remove('on');
      }
      for (const kind of ['attack', 'super']) {
        const a = this.t[kind];
        if (!a || a.id !== t.identifier) continue;
        this.t[kind] = null;
        const pv = this.preview?.kind === kind ? this.preview : null;
        if (this.enabled && e.type !== 'touchcancel')
          this.events.push(pv ? { kind, auto: false, x: pv.x, z: pv.z, mag: pv.mag } : { kind, auto: true });
        if (pv) this.preview = null;
        this.btns[kind].firstElementChild.style.transform = '';
        this.btns[kind].classList.remove('aim');
      }
    }
  }
}
