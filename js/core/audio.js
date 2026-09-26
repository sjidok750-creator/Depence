// Fully synthesised sound: no audio files. Every effect is a tiny envelope
// on an oscillator or filtered noise, plus a soft generative music loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.musicOn = true;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.step = 0;
    this.lastPlayed = new Map();
    try {
      this.muted = localStorage.getItem('tb.muted') === '1';
      this.musicOn = localStorage.getItem('tb.music') !== '0';
    } catch {
      /* storage unavailable */
    }
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate * 1;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem('tb.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem('tb.music', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ primitives

  tone({ freq = 440, to = null, type = 'sine', dur = 0.15, vol = 0.3, attack = 0.005, delay = 0, dest = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.3, freq = 1200, q = 0.8, type = 'lowpass', delay = 0, sweepTo = null }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Rate-limit spammy sounds so 40 arrows don't clip. */
  throttle(key, ms) {
    const now = performance.now();
    const last = this.lastPlayed.get(key) || 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  // ------------------------------------------------------------------ sfx

  play(name, payload) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shoot': {
        const type = payload?.tower?.type;
        if (type === 'archer' && this.throttle('archer', 60)) this.noise({ dur: 0.08, vol: 0.18, freq: 2400, type: 'bandpass', q: 2, sweepTo: 900 });
        else if (type === 'cannon' && this.throttle('cannon', 90)) {
          this.noise({ dur: 0.25, vol: 0.5, freq: 400, sweepTo: 80 });
          this.tone({ freq: 90, to: 40, type: 'triangle', dur: 0.25, vol: 0.4 });
        } else if (type === 'frost' && this.throttle('frost', 120)) {
          this.tone({ freq: 880, to: 1760, type: 'sine', dur: 0.35, vol: 0.12 });
          this.tone({ freq: 1320, to: 2200, type: 'sine', dur: 0.35, vol: 0.06, delay: 0.05 });
        } else if (type === 'tesla' && this.throttle('tesla', 80)) {
          this.noise({ dur: 0.14, vol: 0.28, freq: 3000, type: 'highpass' });
          this.tone({ freq: 1800, to: 300, type: 'sawtooth', dur: 0.12, vol: 0.08 });
        } else if (type === 'sniper' && this.throttle('sniper', 100)) {
          this.noise({ dur: 0.2, vol: 0.4, freq: 1800, sweepTo: 200 });
          this.tone({ freq: 220, to: 60, type: 'square', dur: 0.15, vol: 0.12 });
        }
        break;
      }
      case 'explode':
        if (this.throttle('explode', 70)) this.noise({ dur: 0.35, vol: 0.45, freq: 600, sweepTo: 60 });
        break;
      case 'kill':
        if (this.throttle('kill', 40)) {
          const boss = payload?.enemy?.boss;
          this.tone({ freq: boss ? 300 : 520, to: boss ? 80 : 180, type: 'square', dur: boss ? 0.5 : 0.12, vol: boss ? 0.3 : 0.1 });
          this.noise({ dur: boss ? 0.5 : 0.1, vol: boss ? 0.4 : 0.12, freq: 1500, sweepTo: 200 });
        }
        break;
      case 'gold':
        if (this.throttle('gold', 50)) this.tone({ freq: 1568, type: 'sine', dur: 0.09, vol: 0.09 });
        break;
      case 'place':
        this.noise({ dur: 0.18, vol: 0.35, freq: 500, sweepTo: 120 });
        this.tone({ freq: 330, to: 520, type: 'triangle', dur: 0.14, vol: 0.2 });
        break;
      case 'upgrade':
        [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.2, vol: 0.18, delay: i * 0.06 }));
        break;
      case 'sell':
        this.tone({ freq: 660, to: 330, type: 'triangle', dur: 0.2, vol: 0.2 });
        break;
      case 'deny':
        this.tone({ freq: 200, to: 150, type: 'square', dur: 0.12, vol: 0.12 });
        break;
      case 'select':
        this.tone({ freq: 900, type: 'sine', dur: 0.05, vol: 0.08 });
        break;
      case 'wave-start':
        [392, 523, 659].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.25, vol: 0.14, delay: i * 0.1 }));
        if (payload?.boss) this.tone({ freq: 110, to: 55, type: 'sawtooth', dur: 1.2, vol: 0.2, delay: 0.3 });
        break;
      case 'wave-clear':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.3, vol: 0.14, delay: i * 0.07 }));
        break;
      case 'leak':
        this.tone({ freq: 240, to: 110, type: 'sawtooth', dur: 0.35, vol: 0.25 });
        this.noise({ dur: 0.25, vol: 0.3, freq: 300, sweepTo: 100 });
        break;
      case 'gameover':
        [440, 415, 392, 349].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.5, vol: 0.18, delay: i * 0.28 }));
        break;
      case 'victory':
        [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.18, delay: i * 0.12 }));
        break;
      case 'pause':
        this.tone({ freq: 660, to: 440, type: 'sine', dur: 0.12, vol: 0.1 });
        break;
    }
  }

  // ---------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // A gentle pentatonic arpeggio over a slow bass, scheduled ahead in 1/8 notes.
    const bpm = 96;
    const stepDur = 60 / bpm / 2;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const chords = [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]];
    const base = 261.63; // C4
    let next = this.ctx.currentTime + 0.1;
    const schedule = () => {
      while (next < this.ctx.currentTime + 0.4) {
        const bar = Math.floor(this.step / 16) % chords.length;
        const chord = chords[bar];
        const inBar = this.step % 16;
        if (inBar % 4 === 0) {
          const root = base * Math.pow(2, (chord[0] - 12) / 12);
          this.tone({ freq: root, type: 'triangle', dur: stepDur * 3.5, vol: 0.22, attack: 0.02, delay: next - this.ctx.currentTime, dest: this.musicGain });
        }
        if (inBar % 2 === 0 || Math.random() < 0.35) {
          const deg = scale[(inBar * 3 + bar * 2 + Math.floor(Math.random() * 2)) % scale.length];
          const note = chord[inBar % 3] + deg;
          const f = base * Math.pow(2, note / 12);
          this.tone({ freq: f, type: 'sine', dur: stepDur * 1.8, vol: 0.13, attack: 0.01, delay: next - this.ctx.currentTime, dest: this.musicGain });
        }
        this.step++;
        next += stepDur;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 150);
  }
}
