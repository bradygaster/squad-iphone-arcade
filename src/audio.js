// SHATTERLINE audio. Owned by River. See docs/contract.md §10 (audio.js).
// Synthesized Web Audio SFX only (no files). Muted by default. The AudioContext is created
// lazily inside unlock(), which main calls synchronously from every user gesture (iOS).
// No side effects at import time.

const MAX_VOICES = 12;

export function createAudio() {
  let ctx = null;
  let master = null;     // GainNode: 0 when muted, 1 when on
  let out = null;        // node voices connect to (master input)
  let noiseBuf = null;
  let muted = true;
  let voices = 0;
  let failed = false;    // Web Audio unavailable or construction threw: stay a silent no-op
  let visHooked = false;

  function running() {
    return !!ctx && ctx.state === 'running';
  }

  function onVisibility() {
    try {
      if (document.hidden && ctx && ctx.state === 'running' && ctx.suspend) {
        const p = ctx.suspend();
        if (p && p.catch) p.catch(() => {});
      }
      // No auto-resume: the next gesture's unlock() resumes it (game stays paused anyway).
    } catch (_) { /* ignore */ }
  }

  function createContext() {
    const Ctor = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!Ctor) { failed = true; return; }
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    // Gentle limiter so stacked voices never clip.
    let comp = null;
    try {
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.12;
    } catch (_) { comp = null; }
    if (comp) { master.connect(comp); comp.connect(ctx.destination); } else { master.connect(ctx.destination); }
    out = master;
    // 1-sample silent buffer: the classic iOS unlock.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    if (src.start) src.start(0); else if (src.noteOn) src.noteOn(0);
    if (!visHooked && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility);
      visHooked = true;
    }
  }

  function unlock() {
    if (failed) return;
    try {
      if (!ctx) createContext();
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && ctx.resume) {
        // 'suspended' (autoplay policy / our visibility suspend) or 'interrupted' (iOS).
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) {
      if (!ctx) failed = true;
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (!master || !ctx) return;
    try {
      const t = ctx.currentTime;
      const g = master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(muted ? 0 : 1, t + 0.03);
    } catch (_) {
      try { master.gain.value = muted ? 0 : 1; } catch (__) { /* ignore */ }
    }
  }

  function isMuted() { return muted; }

  // ---- voice helpers ----

  function track(node, stopAt) {
    voices++;
    let done = false;
    const end = () => { if (!done) { done = true; voices = Math.max(0, voices - 1); } };
    node.onended = end;
    // Safety net in case onended never fires (old WebKit).
    setTimeout(end, Math.max(0, (stopAt - ctx.currentTime) * 1000) + 200);
  }

  // One enveloped oscillator note.
  // o: { type, f0, f1 (end freq, exp glide), dur, vol, attack, delay }
  function tone(o) {
    if (voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.1;
    const attack = o.attack || 0.004;
    const vol = o.vol == null ? 0.25 : o.vol;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    track(osc, t0 + dur + 0.02);
  }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.6);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // Deterministic LCG noise (no Math.random needed; audio is not bound by that rule anyway).
    let s = 0x2468ace;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 2147483648) - 1;
    }
    return noiseBuf;
  }

  // Filtered noise burst. o: { dur, vol, f0, f1 (lowpass sweep), delay }
  function noise(o) {
    if (voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.3;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(o.f0 || 2000, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || 200), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.3 : o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    track(src, t0 + dur + 0.02);
  }

  const semis = (f, n) => f * Math.pow(2, n / 12);
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  function arp(notes, step, o) {
    notes.forEach((f, i) => tone({ ...o, f0: f, delay: (o.delay || 0) + i * step }));
  }

  // ---- event voices (contract §6) ----
  const VOICES = {
    start() {
      arp([392, 523.25, 659.25], 0.07, { type: 'square', dur: 0.1, vol: 0.16 });
    },
    waveStart(p) {
      const w = Math.max(1, num(p.wave, 1));
      const base = semis(330, Math.min(12, (w - 1) * 2));
      tone({ type: 'triangle', f0: base, f1: base * 2, dur: 0.22, vol: 0.18 });
    },
    launch() {
      tone({ type: 'square', f0: 280, f1: 760, dur: 0.09, vol: 0.14 });
    },
    paddle(p) {
      const off = Math.max(-1, Math.min(1, num(p.offset, 0)));
      tone({ type: 'square', f0: 220 + off * 30, f1: 180, dur: 0.07, vol: 0.2 });
    },
    wall(p) {
      tone({ type: 'triangle', f0: p.side === 'top' ? 520 : 440, dur: 0.045, vol: 0.14 });
    },
    brick(p) {
      const mult = Math.max(1, Math.min(5, num(p.multiplier, 1)));
      const maxHp = Math.max(1, Math.min(3, num(p.maxHp, 1)));
      if (p.destroyed) {
        // Pitch climbs a whole tone per multiplier step; tougher bricks a bit lower/fatter.
        const f = semis(660 - (maxHp - 1) * 90, (mult - 1) * 2);
        tone({ type: 'square', f0: f, f1: f * 1.5, dur: 0.08, vol: 0.17 });
        if (maxHp > 1) tone({ type: 'triangle', f0: f / 2, dur: 0.12, vol: 0.12 });
      } else {
        const f = semis(260, (mult - 1) * 1);
        tone({ type: 'triangle', f0: f, f1: f * 0.8, dur: 0.06, vol: 0.2 });
      }
    },
    lifeLost() {
      noise({ dur: 0.45, vol: 0.28, f0: 2400, f1: 120 });
      tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.45, vol: 0.14 });
    },
    waveClear() {
      arp([523.25, 659.25, 783.99, 1046.5], 0.08, { type: 'square', dur: 0.14, vol: 0.14 });
    },
    highScore() {
      arp([783.99, 987.77, 1174.66, 1567.98], 0.06, { type: 'triangle', dur: 0.12, vol: 0.18 });
      tone({ type: 'square', f0: 1567.98, dur: 0.25, vol: 0.08, delay: 0.24 });
    },
    gameOver() {
      tone({ type: 'sawtooth', f0: 392, f1: 98, dur: 0.9, vol: 0.16, attack: 0.01 });
      tone({ type: 'square', f0: 196, f1: 49, dur: 0.9, vol: 0.08, attack: 0.01, delay: 0.05 });
    },
    pause(p) {
      tone({ type: 'sine', f0: p.paused ? 880 : 1100, dur: 0.05, vol: 0.12 });
    },
  };

  function play(type, payload) {
    if (muted || !running()) return;
    if (!Object.prototype.hasOwnProperty.call(VOICES, type)) return;
    try {
      VOICES[type](payload && typeof payload === 'object' ? payload : {});
    } catch (_) { /* never throw from audio */ }
  }

  return { unlock, setMuted, isMuted, play };
}
