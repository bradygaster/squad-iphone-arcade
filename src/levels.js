// SHATTERLINE wave layouts and per-wave parameters. Owner: Kaylee. Pure + deterministic.
import {
  BALL_SPEED_BASE, BALL_SPEED_PER_WAVE, BALL_SPEED_WAVE_CAP, BALL_RAMP_MAX_FACTOR,
  BALL_SPEED_ABS_MAX, PADDLE_W_BASE, PADDLE_W_MIN, PADDLE_SHRINK_PER_WAVE,
  BRICK_COLS, BRICK_ROWS_MAX, BRICK_W, BRICK_H, BRICK_GAP, GRID_X, GRID_Y, BRICK_POINTS,
} from './config.js';

export function waveParams(wave) {
  const w = Math.max(1, Math.floor(wave) || 1);
  const ballSpeed = Math.min(BALL_SPEED_BASE + BALL_SPEED_PER_WAVE * (w - 1), BALL_SPEED_WAVE_CAP);
  return {
    ballSpeed,
    ballSpeedMax: Math.min(ballSpeed * BALL_RAMP_MAX_FACTOR, BALL_SPEED_ABS_MAX),
    paddleW: Math.max(PADDLE_W_MIN, PADDLE_W_BASE - PADDLE_SHRINK_PER_WAVE * Math.max(0, w - 2)),
  };
}

// Shapes for waves >= 2: (row, col, rows) -> in shape? Cycle after wave 6.
const SHAPES = [
  // 2: "Breakwater" - full rows with a centre channel in every other row
  (r, c) => !(r % 2 === 1 && (c === 4 || c === 5)),
  // 3: "Lantern" - rounded diamond, wide in the middle rows
  (r, c, rows) => Math.abs(c - 4.5) + Math.abs(r - (rows - 1) / 2) * 0.9 <= 5.2,
  // 4: "Colonnade" - pillars with a solid lintel row on top and bottom
  (r, c, rows) => r === 0 || r === rows - 1 || c % 3 !== 2,
  // 5: "Lattice" - checkerboard with a solid floor row
  (r, c, rows) => (r + c) % 2 === 0 || r === rows - 1,
  // 6: "Arrowhead" - chevron pointing down plus a solid cap
  (r, c) => r <= 1 || Math.abs(c - 4.5) >= (r - 1) * 0.5,
];

function rowsFor(wave) { return wave <= 1 ? 5 : Math.min(4 + wave, BRICK_ROWS_MAX); }

// Waves 1-6: the shape decides which cells hold bricks. Waves 7+: the grid is full (so a
// later wave never has fewer bricks) and the cycling shape marks where the tough bricks go.
function cellsFor(wave) {
  const rows = rowsFor(wave);
  const shape = wave <= 1 ? () => true : SHAPES[(wave - 2) % SHAPES.length];
  const inShape = [], rest = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) (shape(r, c, rows) ? inShape : rest).push([r, c]);
  }
  return wave > 1 + SHAPES.length ? inShape.concat(rest) : inShape; // toughness priority order
}

// Target fractions of tough bricks (rise with wave, reach 1 eventually).
function frac23(wave) { return wave < 2 ? 0 : Math.min(1, 0.2 + 0.1 * (wave - 2)); }
function frac3(wave) { return wave < 3 ? 0 : Math.min(1, 0.1 + 0.06 * (wave - 3)); }

// Counts of (hp>=2) and (hp==3) bricks for a wave, forced so that both shares never
// decrease from one wave to the next (rounding with different brick counts could wobble).
function toughCounts(wave) {
  let s23 = 0, s3 = 0, c23 = 0, c3 = 0;
  for (let w = 2; w <= wave; w++) {
    const n = cellsFor(w).length;
    c23 = Math.min(n, Math.max(Math.ceil(frac23(w) * n - 1e-9), Math.ceil(s23 * n - 1e-9)));
    c3 = Math.min(c23, Math.max(Math.ceil(frac3(w) * n - 1e-9), Math.ceil(s3 * n - 1e-9)));
    s23 = c23 / n; s3 = c3 / n;
  }
  return { c23, c3 };
}

export function buildWave(wave) {
  const w = Math.max(1, Math.floor(wave) || 1);
  const cells = cellsFor(w);
  const { c23, c3 } = w >= 2 ? toughCounts(w) : { c23: 0, c3: 0 };
  const bricks = cells.map(([row, col], i) => {
    const maxHp = i < c3 ? 3 : i < c23 ? 2 : 1;
    return {
      id: row * BRICK_COLS + col, col, row,
      x: GRID_X + col * (BRICK_W + BRICK_GAP),
      y: GRID_Y + row * (BRICK_H + BRICK_GAP),
      w: BRICK_W, h: BRICK_H,
      hp: maxHp, maxHp, points: BRICK_POINTS[maxHp], alive: true,
    };
  });
  return bricks.sort((a, b) => a.id - b.id);
}
