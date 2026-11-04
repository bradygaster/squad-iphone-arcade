// SHATTERLINE game logic. Owner: Kaylee. Pure + deterministic: no DOM, storage, audio,
// randomness or clocks. See docs/contract.md sections 4-8 and 10.
import {
  FIELD_W, FIELD_H, CEIL_Y, PADDLE_Y, PADDLE_H, PADDLE_KEY_SPEED, PADDLE_MAX_BOUNCE_DEG,
  BALL_R, BALL_RAMP_PER_PADDLE_HIT, BALL_SPEED_ABS_MAX, BALL_MIN_VY_FRACTION, LAUNCH_DEG,
  START_LIVES, MULT_CAP, WAVE_BONUS_PER_WAVE, WAVE_BONUS_PER_LIFE, WAVE_CLEAR_TIME,
  GAME_OVER_LOCK,
} from './config.js';
import { waveParams, buildWave } from './levels.js';

const DEG = Math.PI / 180;
const EPS = 1e-9;
const MAX_MOVE = BALL_R * 0.5; // max ball travel per collision substep (no tunneling)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createGame(opts) {
  const high = Math.max(0, Math.floor(num(opts && opts.highScore, 0)));
  const p = waveParams(1);
  const bricks = buildWave(1);
  const state = {
    phase: 'title', paused: false, time: 0, phaseTime: 0,
    wave: 1, score: 0, highScore: high, startHighScore: high, highScoreBeaten: false,
    lives: START_LIVES, combo: 0, multiplier: 1, lastWaveBonus: 0,
    paddle: { x: FIELD_W / 2, y: PADDLE_Y, w: p.paddleW, h: PADDLE_H, vx: 0 },
    ball: { x: FIELD_W / 2, y: 0, r: BALL_R, vx: 0, vy: 0, speed: p.ballSpeed, stuck: true },
    bricks, bricksRemaining: bricks.length,
    events: [],
  };
  stickBall(state);
  return state;
}

export function debugClearWave(state) {
  if (state.phase !== 'serve' && state.phase !== 'playing') return;
  for (const b of state.bricks) { b.hp = 0; b.alive = false; }
  state.bricksRemaining = 0;
}

export function update(state, dt, intent) {
  const it = intent || {};
  const launch = !!it.launch;
  const ph = state.phase;
  const pausable = ph === 'serve' || ph === 'playing' || ph === 'waveClear';
  const wasPaused = state.paused;

  // One-shots first.
  if (pausable) {
    if (it.pauseToggle) setPaused(state, !state.paused);
    if (it.forcePause) setPaused(state, true);
    else if (wasPaused && launch && state.paused) setPaused(state, false);
  }
  if (state.paused) return;
  const doLaunch = launch && !wasPaused; // a tap that resumes never also launches

  state.time += dt;
  state.phaseTime += dt;
  movePaddle(state, it, dt);

  switch (state.phase) {
    case 'title':
      if (doLaunch) startGame(state);
      break;
    case 'serve':
      if (state.bricksRemaining === 0) enterWaveClear(state);
      else if (doLaunch) launchBall(state);
      break;
    case 'playing':
      stepBall(state, dt);
      if (state.bricksRemaining === 0) enterWaveClear(state);
      else if (state.ball.y - state.ball.r > FIELD_H) loseLife(state);
      break;
    case 'waveClear':
      if (state.phaseTime >= WAVE_CLEAR_TIME - EPS) nextWave(state);
      break;
    case 'gameOver':
      if (doLaunch && state.phaseTime >= GAME_OVER_LOCK - EPS) startGame(state);
      break;
  }
  if (state.ball.stuck) stickBall(state);
}

// ---------------------------------------------------------------- phases

function emit(state, type, payload) { state.events.push(payload ? { type, ...payload } : { type }); }

function setPhase(state, phase) { state.phase = phase; state.phaseTime = 0; }

function setPaused(state, paused) {
  if (state.paused === paused) return;
  state.paused = paused;
  emit(state, 'pause', { paused });
}

function resetCombo(state) { state.combo = 0; state.multiplier = 1; }

function stickBall(state) {
  const b = state.ball, p = state.paddle;
  b.stuck = true; b.vx = 0; b.vy = 0;
  b.x = p.x;
  b.y = p.y - p.h / 2 - b.r - 1;
}

function loadWave(state, wave) {
  const p = waveParams(wave);
  state.wave = wave;
  state.bricks = buildWave(wave);
  state.bricksRemaining = state.bricks.length;
  state.paddle.w = p.paddleW;
  state.paddle.x = clamp(state.paddle.x, p.paddleW / 2, FIELD_W - p.paddleW / 2);
  state.ball.speed = p.ballSpeed;
  resetCombo(state);
  stickBall(state);
  emit(state, 'waveStart', { wave });
}

function startGame(state) {
  state.score = 0;
  state.lives = START_LIVES;
  state.startHighScore = state.highScore;
  state.highScoreBeaten = false;
  state.lastWaveBonus = 0;
  state.paddle.x = FIELD_W / 2;
  state.paddle.vx = 0;
  emit(state, 'start');
  loadWave(state, 1);
  setPhase(state, 'serve');
}

function launchBall(state) {
  const b = state.ball;
  const dir = state.paddle.vx < 0 ? -1 : 1;
  b.stuck = false;
  b.speed = waveParams(state.wave).ballSpeed;
  b.vx = dir * b.speed * Math.sin(LAUNCH_DEG * DEG);
  b.vy = -b.speed * Math.cos(LAUNCH_DEG * DEG);
  setPhase(state, 'playing');
  emit(state, 'launch');
}

function enterWaveClear(state) {
  const bonus = WAVE_BONUS_PER_WAVE * state.wave + WAVE_BONUS_PER_LIFE * state.lives;
  state.lastWaveBonus = bonus;
  addScore(state, bonus);
  stickBall(state);
  setPhase(state, 'waveClear');
  emit(state, 'waveClear', { wave: state.wave, bonus });
}

function nextWave(state) {
  loadWave(state, state.wave + 1);
  setPhase(state, 'serve');
}

function loseLife(state) {
  state.lives -= 1;
  resetCombo(state);
  emit(state, 'lifeLost', { lives: state.lives });
  stickBall(state);
  state.ball.speed = waveParams(state.wave).ballSpeed;
  if (state.lives > 0) {
    setPhase(state, 'serve');
  } else {
    setPhase(state, 'gameOver');
    emit(state, 'gameOver', {
      score: state.score, highScore: state.highScore, isNewHigh: state.highScoreBeaten,
    });
  }
}

function addScore(state, pts) {
  if (!pts) return;
  state.score += pts;
  if (state.score > state.highScore) state.highScore = state.score;
  if (state.score > state.startHighScore && !state.highScoreBeaten) {
    state.highScoreBeaten = true;
    if (state.startHighScore > 0) emit(state, 'highScore', { score: state.score });
  }
}

// ---------------------------------------------------------------- physics

function movePaddle(state, it, dt) {
  const p = state.paddle;
  const prev = p.x;
  if (typeof it.pointerX === 'number' && Number.isFinite(it.pointerX)) p.x = it.pointerX;
  p.x += num(it.dragDX, 0);
  p.x += clamp(num(it.axis, 0), -1, 1) * PADDLE_KEY_SPEED * dt;
  p.x = clamp(p.x, p.w / 2, FIELD_W - p.w / 2);
  p.vx = dt > 0 ? (p.x - prev) / dt : 0;
}

// Keep |v| == speed and |vy| >= speed * BALL_MIN_VY_FRACTION (prevents flat loops).
function enforceMinVy(b) {
  const s = b.speed, minVy = s * BALL_MIN_VY_FRACTION;
  if (Math.abs(b.vy) < minVy) {
    const sy = b.vy < 0 ? -1 : 1;
    const sx = b.vx < 0 ? -1 : 1;
    b.vy = sy * minVy;
    b.vx = sx * Math.sqrt(Math.max(0, s * s - minVy * minVy));
  }
}

function stepBall(state, dt) {
  const b = state.ball;
  const dist = b.speed * dt;
  const n = Math.max(1, Math.ceil(dist / MAX_MOVE));
  const h = dt / n;
  let brickHit = false; // contract §7.6: at most one brick per simulation step
  for (let i = 0; i < n; i++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    collideWalls(state, b);
    collidePaddle(state, b);
    if (!brickHit) brickHit = collideBricks(state, b);
    if (b.y - b.r > FIELD_H) return;
  }
}

function collideWalls(state, b) {
  let side = null;
  if (b.x < b.r) { b.x = b.r; if (b.vx < 0) { b.vx = -b.vx; side = 'left'; } }
  else if (b.x > FIELD_W - b.r) { b.x = FIELD_W - b.r; if (b.vx > 0) { b.vx = -b.vx; side = 'right'; } }
  if (side) { enforceMinVy(b); emit(state, 'wall', { side }); }
  if (b.y < CEIL_Y + b.r) {
    b.y = CEIL_Y + b.r;
    if (b.vy < 0) { b.vy = -b.vy; enforceMinVy(b); emit(state, 'wall', { side: 'top' }); }
  }
}

function collidePaddle(state, b) {
  const p = state.paddle;
  if (b.vy <= 0) return;
  const left = p.x - p.w / 2, top = p.y - p.h / 2, bottom = p.y + p.h / 2;
  if (b.y > bottom) return; // already past the paddle: it is lost
  const cx = clamp(b.x, left, left + p.w), cy = clamp(b.y, top, bottom);
  const dx = b.x - cx, dy = b.y - cy;
  if (dx * dx + dy * dy > b.r * b.r) return;
  const offset = clamp((b.x - p.x) / (p.w / 2), -1, 1);
  const angle = offset * PADDLE_MAX_BOUNCE_DEG * DEG;
  const cap = Math.min(waveParams(state.wave).ballSpeedMax, BALL_SPEED_ABS_MAX);
  b.speed = Math.min(b.speed * BALL_RAMP_PER_PADDLE_HIT, cap);
  b.vx = b.speed * Math.sin(angle);
  b.vy = -b.speed * Math.cos(angle);
  b.y = top - b.r - 0.01;
  resetCombo(state);
  emit(state, 'paddle', { x: b.x, offset });
}

// Resolves the deepest-overlapping alive brick (if any). Returns true on a hit.
function collideBricks(state, b) {
  let best = null, bestPen = 0, bestAxis = 'y';
  for (const k of state.bricks) {
    if (!k.alive) continue;
    const hx = k.w / 2, hy = k.h / 2;
    const kcx = k.x + hx, kcy = k.y + hy;
    const dx = b.x - kcx, dy = b.y - kcy;
    const ox = hx + b.r - Math.abs(dx), oy = hy + b.r - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    // Exact circle test for corner regions.
    const qx = Math.abs(dx) - hx, qy = Math.abs(dy) - hy;
    if (qx > 0 && qy > 0 && qx * qx + qy * qy > b.r * b.r) continue;
    const pen = Math.min(ox, oy);
    if (best === null || pen > bestPen) { best = k; bestPen = pen; bestAxis = ox < oy ? 'x' : 'y'; }
  }
  if (!best) return false;

  const k = best;
  const kcx = k.x + k.w / 2, kcy = k.y + k.h / 2;
  if (bestAxis === 'x') {
    const s = b.x < kcx ? -1 : 1;
    b.x = s < 0 ? k.x - b.r - 0.01 : k.x + k.w + b.r + 0.01;
    b.vx = s * Math.abs(b.vx);
  } else {
    const s = b.y < kcy ? -1 : 1;
    b.y = s < 0 ? k.y - b.r - 0.01 : k.y + k.h + b.r + 0.01;
    b.vy = s * Math.abs(b.vy);
  }
  enforceMinVy(b);

  state.combo += 1;
  state.multiplier = Math.min(MULT_CAP, Math.max(1, state.combo));
  k.hp -= 1;
  let points = 0;
  const destroyed = k.hp <= 0;
  if (destroyed) {
    k.hp = 0; k.alive = false;
    state.bricksRemaining -= 1;
    points = k.points * state.multiplier;
  }
  emit(state, 'brick', {
    id: k.id, x: kcx, y: kcy, hp: k.hp, maxHp: k.maxHp, destroyed, points,
    multiplier: state.multiplier,
  });
  addScore(state, points); // after the brick event so 'highScore' follows its cause
  return true;
}
