// SHATTERLINE shared constants. Owned by Mal. Change only via docs/contract.md.
export const FIELD_W = 360;
export const FIELD_H = 640;
export const HUD_H = 48;
export const CEIL_Y = 48;

export const STEP = 1 / 120;          // fixed simulation step, seconds
export const MAX_STEPS = 8;           // max substeps per animation frame
export const MAX_FRAME_DT = 0.25;     // clamp for frame delta, seconds

export const PADDLE_Y = 600;          // paddle center y
export const PADDLE_H = 12;
export const PADDLE_W_BASE = 72;
export const PADDLE_W_MIN = 40;
export const PADDLE_SHRINK_PER_WAVE = 4;   // applied from wave 3 onward
export const PADDLE_KEY_SPEED = 480;  // u/s at axis = ±1
export const PADDLE_MAX_BOUNCE_DEG = 60;   // ball angle from vertical at paddle edge

export const BALL_R = 5;
export const BALL_SPEED_BASE = 300;   // u/s, wave 1
export const BALL_SPEED_PER_WAVE = 25;
export const BALL_SPEED_WAVE_CAP = 520;
export const BALL_RAMP_PER_PADDLE_HIT = 1.02;
export const BALL_RAMP_MAX_FACTOR = 1.25;  // in-wave cap = waveSpeed * this
export const BALL_SPEED_ABS_MAX = 640;
export const BALL_MIN_VY_FRACTION = 0.35;  // |vy| >= speed * this after any bounce
export const LAUNCH_DEG = 15;         // launch angle from vertical

export const BRICK_COLS = 10;
export const BRICK_ROWS_MAX = 10;
export const BRICK_W = 32;
export const BRICK_H = 14;
export const BRICK_GAP = 2;
export const GRID_X = 11;             // (360 - (10*32 + 9*2)) / 2
export const GRID_Y = 80;
export const BRICK_POINTS = Object.freeze({ 1: 10, 2: 30, 3: 60 }); // by maxHp

export const START_LIVES = 3;
export const MULT_CAP = 5;
export const WAVE_BONUS_PER_WAVE = 200;
export const WAVE_BONUS_PER_LIFE = 100;

export const WAVE_CLEAR_TIME = 1.6;   // seconds in 'waveClear' before next 'serve'
export const GAME_OVER_LOCK = 1.0;    // seconds before launch restarts from 'gameOver'

export const TOUCH_DRAG_GAIN = 1.2;   // logical paddle travel per logical finger travel
export const TAP_MAX_MS = 250;
export const TAP_MAX_MOVE_PX = 12;    // CSS px

export const STORAGE_KEY = 'shatterline.highscore.v1';

export const NEUTRAL_INTENT = Object.freeze({
  pointerX: null, dragDX: 0, axis: 0,
  launch: false, pauseToggle: false, forcePause: false, muteToggle: false,
});
