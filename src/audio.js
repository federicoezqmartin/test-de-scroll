// Sonido sintetizado con WebAudio: no hay archivos de audio.
class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('trifulca-mute') === '1'; } catch { /* sin storage */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('trifulca-mute', m ? '1' : '0'); } catch { /* sin storage */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.15, vol = 0.3, f0 = 2000, f1 = f0, type = 'lowpass', q = 1, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5, dur + 0.05);
  }

  play(name, v = 1) {
    if (!this.ctx || this.muted || v <= 0.02) return;
    const T = (o) => this.tone({ ...o, vol: (o.vol ?? 0.3) * v });
    const N = (o) => this.noise({ ...o, vol: (o.vol ?? 0.3) * v });
    switch (name) {
      case 'bolt': T({ type: 'square', f0: 980, f1: 320, dur: 0.07, vol: 0.13 }); N({ dur: 0.04, vol: 0.12, f0: 5000, type: 'highpass' }); break;
      case 'ember': N({ dur: 0.16, vol: 0.32, f0: 1800, f1: 300, type: 'bandpass' }); T({ f0: 150, f1: 60, dur: 0.14, vol: 0.3 }); break;
      case 'dart': T({ type: 'triangle', f0: 1700, f1: 480, dur: 0.11, vol: 0.2 }); N({ dur: 0.1, vol: 0.14, f0: 3000, f1: 7000, type: 'bandpass' }); break;
      case 'lob': T({ f0: 280, f1: 640, dur: 0.16, vol: 0.26 }); break;
      case 'slash': N({ dur: 0.1, vol: 0.3, f0: 2500, f1: 8000, type: 'bandpass', q: 2 }); break;
      case 'boom': N({ dur: 0.38, vol: 0.5, f0: 1200, f1: 90 }); T({ f0: 130, f1: 38, dur: 0.32, vol: 0.5 }); break;
      case 'hit': T({ type: 'triangle', f0: 620, f1: 240, dur: 0.06, vol: 0.2 }); break;
      case 'hurt': T({ type: 'square', f0: 230, f1: 110, dur: 0.12, vol: 0.18 }); N({ dur: 0.07, vol: 0.14, f0: 900 }); break;
      case 'death': T({ type: 'sawtooth', f0: 420, f1: 55, dur: 0.5, vol: 0.24 }); N({ dur: 0.45, vol: 0.32, f0: 2400, f1: 150 }); break;
      case 'pickup': T({ f0: 880, dur: 0.08, vol: 0.2 }); T({ f0: 1320, dur: 0.13, vol: 0.2, delay: 0.07 }); break;
      case 'super': T({ type: 'sawtooth', f0: 180, f1: 980, dur: 0.3, vol: 0.2 }); N({ dur: 0.3, vol: 0.2, f0: 500, f1: 6000, type: 'bandpass' }); break;
      case 'ready': [660, 880, 1175].forEach((f, i) => T({ type: 'triangle', f0: f, dur: 0.12, vol: 0.2, delay: i * 0.07 })); break;
      case 'beep': T({ f0: 1040, dur: 0.09, vol: 0.2 }); break;
      case 'tick': T({ type: 'triangle', f0: 520, dur: 0.12, vol: 0.24 }); break;
      case 'go': [523, 659, 784, 1047].forEach((f) => T({ type: 'triangle', f0: f, dur: 0.4, vol: 0.13 })); break;
      case 'respawn': T({ f0: 330, f1: 990, dur: 0.25, vol: 0.2 }); break;
      case 'wood': N({ dur: 0.22, vol: 0.4, f0: 1400, f1: 240, type: 'bandpass', q: 1.5 }); T({ type: 'square', f0: 190, f1: 70, dur: 0.12, vol: 0.2 }); N({ dur: 0.05, vol: 0.3, f0: 4000, type: 'highpass', delay: 0.03 }); break;
      case 'clank': T({ type: 'square', f0: 1500, f1: 900, dur: 0.07, vol: 0.12 }); T({ type: 'triangle', f0: 2300, f1: 1700, dur: 0.16, vol: 0.1, delay: 0.02 }); N({ dur: 0.08, vol: 0.18, f0: 5200, type: 'highpass' }); break;
      case 'squish': N({ dur: 0.11, vol: 0.3, f0: 900, f1: 220, type: 'lowpass', q: 3 }); T({ f0: 150, f1: 75, dur: 0.09, vol: 0.2 }); break;
      case 'thud': T({ f0: 110, f1: 42, dur: 0.22, vol: 0.45 }); N({ dur: 0.12, vol: 0.2, f0: 500, f1: 120 }); break;
      case 'splash': N({ dur: 0.3, vol: 0.28, f0: 2600, f1: 600, type: 'bandpass' }); break;
      case 'ui': T({ type: 'triangle', f0: 760, f1: 900, dur: 0.05, vol: 0.16 }); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => T({ type: 'triangle', f0: f, dur: 0.3, vol: 0.2, delay: i * 0.12 })); break;
      case 'lose': [440, 392, 330, 262].forEach((f, i) => T({ type: 'triangle', f0: f, dur: 0.35, vol: 0.2, delay: i * 0.18 })); break;
      default: break;
    }
  }
}

export const audio = new AudioSys();
