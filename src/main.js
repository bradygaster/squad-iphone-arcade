// SHATTERLINE bootstrap. Owned by Mal. See docs/contract.md §11 (integration) and §12 (test hook).
// This is the only module with import-time side effects.
import * as C from './config.js';
import { createGame, update, debugClearWave } from './game.js';
import { loadHighScore, saveHighScore } from './storage.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const stage = $('stage');
const pauseBtn = $('pause-btn');
const soundBtn = $('sound-btn');

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------
let savedHigh = loadHighScore();
const state = createGame({ highScore: savedHigh });
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput({
  surface: stage,
  pauseButton: pauseBtn,
  soundButton: soundBtn,
  // Wrapped so input never depends on renderer method binding.
  toLogical: (clientX, clientY) => renderer.toLogical(clientX, clientY),
  onGesture: () => audio.unlock(),
});

// ---------------------------------------------------------------------------
// Viewport / resize
// ---------------------------------------------------------------------------
const resize = () => renderer.resize();
// iOS reports stale sizes right after an orientation change: re-measure after layout settles.
const resizeSoon = () => {
  resize();
  requestAnimationFrame(resize);
  setTimeout(resize, 250);
};
addEventListener('resize', resize);
addEventListener('orientationchange', resizeSoon);
window.visualViewport?.addEventListener('resize', resize);
// #stage can change size without a window resize (toolbar layout, safe-area changes).
if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(stage);
resize();

// ---------------------------------------------------------------------------
// Intent accumulation: one-shots are never lost when a frame runs 0 substeps.
// ---------------------------------------------------------------------------
const ONE_SHOTS = ['launch', 'pauseToggle', 'forcePause', 'muteToggle'];
let pending = { ...C.NEUTRAL_INTENT };
let injected = {}; // test-hook one-shots / pointerX, merged through the same path as real input

function takeInjected() {
  const out = injected;
  injected = {};
  return out;
}

function gatherIntent() {
  const i = { ...input.poll(), ...takeInjected() };
  pending.pointerX = i.pointerX ?? null;
  pending.axis = i.axis || 0;
  pending.dragDX += i.dragDX || 0;
  for (const k of ONE_SHOTS) pending[k] ||= !!i[k];
}

// Full intent for the first substep of a frame; later substeps carry only held state.
function consumeIntent() {
  const out = pending;
  pending = { ...C.NEUTRAL_INTENT, pointerX: out.pointerX, axis: out.axis };
  return out;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function stepOnce() {
  const intent = consumeIntent();
  if (intent.muteToggle) audio.setMuted(!audio.isMuted());
  update(state, C.STEP, intent);
}

let lastEvents = [];

function persistHighScore() {
  if (state.highScore > savedHigh) {
    saveHighScore(state.highScore);
    savedHigh = state.highScore;
  }
}

function afterSim() {
  for (const e of state.events) audio.play(e.type, e);
  persistHighScore(); // same frame the high score rises
  renderer.draw(state); // may read state.events
  lastEvents = state.events.slice();
  state.events.length = 0;
  syncButtons();
}

// ---------------------------------------------------------------------------
// Toolbar sync (DOM writes only on change)
// ---------------------------------------------------------------------------
const ui = { paused: null, pauseDisabled: null, soundOn: null };

function syncButtons() {
  const paused = !!state.paused;
  const pauseDisabled = state.phase === 'title' || state.phase === 'gameOver';
  const soundOn = !audio.isMuted();

  if (paused !== ui.paused) {
    ui.paused = paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.textContent = paused ? 'RESUME' : 'PAUSE';
  }
  if (pauseDisabled !== ui.pauseDisabled) {
    ui.pauseDisabled = pauseDisabled;
    pauseBtn.disabled = pauseDisabled;
  }
  if (soundOn !== ui.soundOn) {
    ui.soundOn = soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.textContent = soundOn ? 'SOUND: ON' : 'SOUND: OFF';
  }
}

// ---------------------------------------------------------------------------
// Fixed-step loop
// ---------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let running = false;
let rafId = 0;

function frame(now) {
  if (!running) return;
  rafId = requestAnimationFrame(frame);
  acc += Math.min(Math.max(0, (now - last) / 1000), C.MAX_FRAME_DT);
  last = now;
  gatherIntent();
  let n = 0;
  while (acc >= C.STEP && n < C.MAX_STEPS) {
    stepOnce();
    acc -= C.STEP;
    n++;
  }
  if (n === C.MAX_STEPS) acc = 0; // drop backlog after a stall
  afterSim(); // draw once per animation frame, even with 0 substeps
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  acc = 0;
  rafId = requestAnimationFrame(frame);
}

function stop() {
  running = false;
  cancelAnimationFrame(rafId);
}

syncButtons();
start();

// Belt and braces: persist on page teardown / backgrounding (never lowers the stored value).
addEventListener('pagehide', persistHighScore);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persistHighScore();
});

// ---------------------------------------------------------------------------
// Test hook (§12)
// ---------------------------------------------------------------------------
const PRESS_MAP = Object.freeze({
  launch: 'launch',
  pause: 'pauseToggle',
  forcePause: 'forcePause',
  mute: 'muteToggle',
});

window.__shatterline = Object.freeze({
  version: 1,
  get state() { return state; },
  config: C,
  press(action) {
    const key = PRESS_MAP[action];
    if (!key) throw new Error(`__shatterline.press: unknown action "${action}"`);
    injected[key] = true;
  },
  setPaddleX(x) {
    injected.pointerX = Number(x);
  },
  step(n = 1) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    gatherIntent();
    for (let k = 0; k < count; k++) stepOnce();
    afterSim();
  },
  clearWave() {
    debugClearWave(state);
  },
  stop,
  start,
  get running() { return running; },
  audio: Object.freeze({ isMuted: () => audio.isMuted() }),
  get events() { return lastEvents; },
});
