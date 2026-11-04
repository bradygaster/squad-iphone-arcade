// SHATTERLINE renderer. Owned by Wash. Canvas 2D drawing, HUD, overlays, scaling,
// client -> logical mapping. Imports only config.js. Treats `state` as read-only.
import {
  FIELD_W, FIELD_H, HUD_H, CEIL_Y, BRICK_COLS, BRICK_ROWS_MAX, GAME_OVER_LOCK,
} from './config.js';

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const BG = '#07080f';          // letterbox / page background (matches theme-color)
const FIELD_BG = '#0b0e1c';
const GRID_LINE = 'rgba(90, 120, 255, 0.07)';
const FG = '#e8f6ff';
const DIM = '#7f8db8';
const WALL = '#3ef2ff';
const PADDLE = '#c8ff3e';
const BALL = '#ffffff';
const GOLD = '#ffd23e';
const DANGER = '#ff3e6c';
// Brick hue by maxHp: 1 = cyan, 2 = magenta, 3 = amber.
const BRICK_HEX = { 1: '#3ef2ff', 2: '#ff4fd8', 3: '#ffa53e' };

const MAX_PARTICLES = 160;
const TRAIL_LEN = 8;
const FLASH_TIME = 0.12;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba([r, g, b], a, k = 1) {
  return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
}
// Small deterministic hash so cracks stay put frame to frame.
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
  return (n >>> 0) / 4294967296;
}

// Precomputed brick styles per (maxHp, hp): fill, edge, highlight.
function buildBrickStyles() {
  const out = {};
  for (let m = 1; m <= 3; m++) {
    const rgb = hexRgb(BRICK_HEX[m]);
    for (let h = 1; h <= m; h++) {
      const k = 0.45 + 0.55 * (h / m);     // darker as it takes damage
      out[m * 10 + h] = {
        fill: rgba(rgb, 0.22 + 0.5 * (h / m), k),
        edge: rgba(rgb, 0.95, k),
        hi: rgba([255, 255, 255], 0.18 + 0.22 * (h / m)),
        spark: BRICK_HEX[m],
      };
    }
  }
  return out;
}

function makeGlowSprite(doc) {
  const c = doc.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.25, 'rgba(120,240,255,0.45)');
  grd.addColorStop(1, 'rgba(60,120,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false }) || canvas.getContext('2d');
  const styles = buildBrickStyles();
  const glow = makeGlowSprite(canvas.ownerDocument || document);

  let cssW = 0, cssH = 0, dpr = 1;
  let scale = 1, offX = 0, offY = 0;   // CSS px per u; field offset in CSS px

  // Render-local FX state (never written back into game state).
  const hitAt = new Float64Array(BRICK_COLS * BRICK_ROWS_MAX).fill(-1e9);
  const particles = [];
  const trail = [];                    // [{x,y}] newest last
  let lifeLostAt = -1e9, highScoreAt = -1e9, lastTime = 0;

  function resize() {
    const w = canvas.clientWidth || 0;
    const h = canvas.clientHeight || 0;
    const ratio = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 3);
    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    cssW = w; cssH = h; dpr = ratio;
    scale = w > 0 && h > 0 ? Math.min(w / FIELD_W, h / FIELD_H) : 1;
    offX = (w - FIELD_W * scale) / 2;
    offY = (h - FIELD_H * scale) / 2;
  }

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - offX) / scale, y: (clientY - r.top - offY) / scale };
  }

  function getScale() { return scale; }

  // ---- FX bookkeeping -------------------------------------------------------
  function consumeEvents(state) {
    const t = state.time;
    if (t < lastTime) {                 // time went backwards: reset FX
      particles.length = 0; trail.length = 0; hitAt.fill(-1e9);
      lifeLostAt = highScoreAt = -1e9;
    }
    lastTime = t;
    const evs = state.events || [];
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (!e) continue;
      switch (e.type) {
        case 'brick':
          if (e.id >= 0 && e.id < hitAt.length) hitAt[e.id] = t;
          if (e.destroyed) spawnBurst(e.x, e.y, BRICK_HEX[e.maxHp] || FG, e.id | 0, t);
          break;
        case 'waveStart': hitAt.fill(-1e9); break;
        case 'lifeLost': lifeLostAt = t; trail.length = 0; break;
        case 'highScore': highScoreAt = t; break;
        case 'start': highScoreAt = -1e9; particles.length = 0; break;
        default: break;
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const a = t - particles[i].t0;
      if (a > particles[i].life || a < 0) particles.splice(i, 1);
    }
  }

  function spawnBurst(x, y, color, seed, t) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const ang = (i / n) * Math.PI * 2 + hash(seed * 7 + i) * 0.9;
      const sp = 50 + hash(seed * 13 + i) * 90;
      particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 20,
        t0: t, life: 0.35 + hash(seed + i * 3) * 0.25, color });
    }
  }

  function updateTrail(state) {
    const b = state.ball;
    if (!b || b.stuck || state.phase !== 'playing') { trail.length = 0; return; }
    if (state.paused) return;
    const last = trail[trail.length - 1];
    if (last && Math.abs(last.x - b.x) + Math.abs(last.y - b.y) > 80) trail.length = 0;
    if (!last || last.x !== b.x || last.y !== b.y) {
      trail.push({ x: b.x, y: b.y });
      if (trail.length > TRAIL_LEN) trail.shift();
    }
  }

  // ---- drawing helpers ------------------------------------------------------
  function text(str, x, y, size, color, align = 'center', weight = '700') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function glowText(str, x, y, size, color, blur) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * scale * dpr;  // shadowBlur ignores the transform
    text(str, x, y, size, color);
    ctx.restore();
  }
  function veil(a) {
    ctx.fillStyle = `rgba(4,5,12,${a})`;
    ctx.fillRect(0, CEIL_Y, FIELD_W, FIELD_H - CEIL_Y);
  }

  function drawField() {
    ctx.fillStyle = FIELD_BG;
    ctx.fillRect(0, 0, FIELD_W, FIELD_H);
    ctx.fillStyle = GRID_LINE;
    for (let x = 30; x < FIELD_W; x += 30) ctx.fillRect(x, CEIL_Y, 1, FIELD_H - CEIL_Y);
    for (let y = CEIL_Y + 32; y < FIELD_H; y += 32) ctx.fillRect(0, y, FIELD_W, 1);
    // walls + ceiling
    ctx.fillStyle = rgba(hexRgb(WALL), 0.18);
    ctx.fillRect(0, CEIL_Y - 2, FIELD_W, 4);
    ctx.fillRect(0, CEIL_Y, 3, FIELD_H - CEIL_Y);
    ctx.fillRect(FIELD_W - 3, CEIL_Y, 3, FIELD_H - CEIL_Y);
    ctx.fillStyle = WALL;
    ctx.fillRect(0, CEIL_Y - 0.5, FIELD_W, 1);
    ctx.fillRect(0, CEIL_Y, 1, FIELD_H - CEIL_Y);
    ctx.fillRect(FIELD_W - 1, CEIL_Y, 1, FIELD_H - CEIL_Y);
    // danger line below the paddle
    ctx.fillStyle = 'rgba(255,62,108,0.12)';
    ctx.fillRect(0, FIELD_H - 2, FIELD_W, 2);
  }

  function drawBricks(state) {
    const bricks = state.bricks || [];
    const t = state.time;
    ctx.lineWidth = 1;
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      if (!br.alive || br.hp <= 0) continue;
      const m = Math.min(3, Math.max(1, br.maxHp | 0));
      const h = Math.min(m, Math.max(1, br.hp | 0));
      const s = styles[m * 10 + h];
      const { x, y, w } = br, bh = br.h;
      ctx.fillStyle = s.fill;
      ctx.fillRect(x, y, w, bh);
      ctx.fillStyle = s.hi;
      ctx.fillRect(x + 1, y + 1, w - 2, 2);
      ctx.strokeStyle = s.edge;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, bh - 1);
      if (m >= 2) {                     // armor pips: one per remaining hit
        ctx.fillStyle = s.edge;
        const pw = 3, gap = 3, tot = h * pw + (h - 1) * gap;
        let px = x + (w - tot) / 2;
        for (let p = 0; p < h; p++, px += pw + gap) ctx.fillRect(px, y + bh - 5, pw, 2);
      }
      if (m === 3) {                    // reinforced corners for 3-hit bricks
        ctx.fillStyle = s.edge;
        ctx.fillRect(x, y, 3, 3); ctx.fillRect(x + w - 3, y, 3, 3);
        ctx.fillRect(x, y + bh - 3, 3, 3); ctx.fillRect(x + w - 3, y + bh - 3, 3, 3);
      }
      if (h < m) drawCracks(br, m - h);
      const fa = t - hitAt[br.id];
      if (fa >= 0 && fa < FLASH_TIME) {
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - fa / FLASH_TIME)})`;
        ctx.fillRect(x, y, w, bh);
      }
    }
  }

  function drawCracks(br, damage) {
    ctx.strokeStyle = 'rgba(5,6,14,0.85)';
    ctx.beginPath();
    for (let c = 0; c < damage; c++) {
      const s = br.id * 31 + c * 7;
      let cx = br.x + 6 + hash(s) * (br.w - 12);
      let cy = br.y + 1;
      ctx.moveTo(cx, cy);
      for (let k = 1; k <= 3; k++) {
        cx += (hash(s + k) - 0.5) * 8;
        cy = br.y + 1 + (br.h - 2) * (k / 3);
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();
  }

  function drawParticles(t) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = t - p.t0;
      const k = 1 - a / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + p.vx * a - 1.5, p.y + p.vy * a + 120 * a * a - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  function drawPaddle(state) {
    const p = state.paddle;
    if (!p) return;
    const x = p.x - p.w / 2, y = p.y - p.h / 2;
    ctx.globalAlpha = 0.35;
    ctx.drawImage(glow, x - 10, y - 12, p.w + 20, p.h + 24);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PADDLE;
    ctx.fillRect(x, y, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 2, y + 2, p.w - 4, 2);
    ctx.fillStyle = 'rgba(7,8,15,0.55)';
    ctx.fillRect(p.x - 1, y + 3, 2, p.h - 5);   // center notch
  }

  function drawBall(state) {
    const b = state.ball;
    if (!b) return;
    if (state.phase === 'waveClear' || state.phase === 'gameOver') return;
    const r = b.r;
    ctx.fillStyle = '#7ff6ff';
    for (let i = 0; i < trail.length - 1; i++) {
      const k = (i + 1) / trail.length;
      ctx.globalAlpha = 0.28 * k;
      const tr = r * (0.4 + 0.6 * k);
      ctx.fillRect(trail[i].x - tr, trail[i].y - tr, tr * 2, tr * 2);
    }
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glow, b.x - r * 4, b.y - r * 4, r * 8, r * 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BALL;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHud(state) {
    ctx.fillStyle = 'rgba(7,8,15,0.92)';
    ctx.fillRect(0, 0, FIELD_W, HUD_H);
    ctx.textBaseline = 'alphabetic';
    text(String(state.score | 0), 10, 22, 18, FG, 'left');
    text(`WAVE ${state.wave | 0}`, FIELD_W / 2, 20, 13, WALL);
    const beat = !!state.highScoreBeaten;
    text(`HI ${state.highScore | 0}`, FIELD_W - 10, 20, 13, beat ? GOLD : DIM, 'right');
    // lives as pips
    const lives = Math.max(0, state.lives | 0);
    ctx.fillStyle = PADDLE;
    for (let i = 0; i < Math.min(lives, 8); i++) ctx.fillRect(10 + i * 16, 32, 12, 4);
    if ((state.multiplier | 0) >= 2) {
      const m = state.multiplier | 0;
      text(`x${m}`, FIELD_W / 2, 40, 14 + m, m >= 5 ? GOLD : BRICK_HEX[2]);
    }
    if (beat && state.phase !== 'title') {
      text('NEW HI', FIELD_W - 10, 39, 10, GOLD, 'right');
    }
  }

  function pulse(t, rate = 2.2) { return 0.55 + 0.45 * Math.sin(t * Math.PI * rate); }

  function drawOverlays(state) {
    const t = state.time, pt = state.phaseTime;
    ctx.textBaseline = 'middle';
    const cx = FIELD_W / 2;
    if (state.paused) {
      veil(0.72);
      glowText('PAUSED', cx, 300, 34, WALL, 14);
      text('TAP TO RESUME', cx, 344, 13, FG);
      return;
    }
    switch (state.phase) {
      case 'title': {
        veil(0.6);
        glowText('SHATTERLINE', cx, 250, 36, BRICK_HEX[2], 16);
        ctx.fillStyle = WALL;
        ctx.fillRect(cx - 110, 276, 220, 1);
        ctx.globalAlpha = pulse(performanceTime());
        text('TAP / CLICK / SPACE TO START', cx, 320, 13, FG);
        ctx.globalAlpha = 1;
        text('DRAG OR ← → TO MOVE', cx, 348, 12, DIM);
        if ((state.highScore | 0) > 0) text(`HI ${state.highScore | 0}`, cx, 392, 13, GOLD);
        break;
      }
      case 'serve': {
        ctx.globalAlpha = 0.35 + 0.35 * pulse(performanceTime(), 1.4);
        text('TAP TO LAUNCH', cx, 520, 12, FG, 'center', '600');
        ctx.globalAlpha = 1;
        break;
      }
      case 'waveClear': {
        veil(0.45);
        glowText(`WAVE ${state.wave | 0} CLEAR`, cx, 290, 28, WALL, 14);
        text(`+${state.lastWaveBonus | 0}`, cx, 332, 20, GOLD);
        break;
      }
      case 'gameOver': {
        veil(0.7);
        glowText('GAME OVER', cx, 250, 36, DANGER, 16);
        text(String(state.score | 0), cx, 300, 26, FG);
        if (state.highScoreBeaten) glowText('NEW HIGH SCORE', cx, 340, 16, GOLD, 10);
        else text(`HI ${state.highScore | 0}`, cx, 340, 13, DIM);
        if (pt >= GAME_OVER_LOCK) {
          ctx.globalAlpha = pulse(performanceTime());
          text('TAP TO PLAY AGAIN', cx, 400, 14, FG);
          ctx.globalAlpha = 1;
        }
        break;
      }
      default: break;
    }
    // Mid-game toast when the stored high score is first beaten.
    const ha = t - highScoreAt;
    if (state.phase === 'playing' || state.phase === 'serve') {
      if (ha >= 0 && ha < 1.8) {
        ctx.globalAlpha = Math.min(1, (1.8 - ha) * 2);
        glowText('NEW HIGH SCORE', cx, 448, 16, GOLD, 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Wall clock only for cosmetic blinking of prompts (keeps blinking while sim time is frozen).
  function performanceTime() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  function draw(state) {
    if (!state) return;
    if (canvas.width <= 1 || cssW === 0) resize();
    consumeEvents(state);
    updateTrail(state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = scale * dpr;
    ctx.setTransform(k, 0, 0, k, offX * dpr, offY * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD_W, FIELD_H);
    ctx.clip();

    drawField();
    drawBricks(state);
    drawParticles(state.time);
    drawPaddle(state);
    drawBall(state);

    const la = state.time - lifeLostAt;
    if (la >= 0 && la < 0.35) {
      ctx.fillStyle = `rgba(255,62,108,${0.28 * (1 - la / 0.35)})`;
      ctx.fillRect(0, CEIL_Y, FIELD_W, FIELD_H - CEIL_Y);
    }

    drawHud(state);
    drawOverlays(state);
    ctx.restore();
  }

  return { resize, draw, toLogical, getScale };
}
