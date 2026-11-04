# SHATTERLINE — Module Contract (v1)

Owner: **Mal**. This file is binding. Kaylee, Wash and River build against it in parallel
without coordinating; anything not specified here is the module owner's call **as long as it
does not change a name, signature, field, unit or rule written here**. Contract changes go
through Mal (decision inbox note) — never silently.

SHATTERLINE is an original, touch-first brick-breaker homage to the 1976 arcade *Breakout*.
Original name, palette, code and synthesized sound. No copied assets, names or trademarks.

---

## 0. Hard rules (all modules)

- Plain HTML + CSS + JavaScript ES modules (`<script type="module">`). No build, no npm, no
  CDNs, no external fonts/images/sounds/network requests. Served by `python3 -m http.server`.
- Canvas 2D for the playfield. Web Audio for sound (synthesized; no audio files).
- Relative imports with explicit `.js` extension (`import { X } from './config.js'`).
- **No module except `main.js` has side effects at import time** (no DOM access, no listeners,
  no AudioContext, no localStorage at top level). Everything happens inside exported functions.
- Named exports only. No default exports. No globals except `window.__shatterline` (main.js).
- All gameplay geometry is in **logical units (u)** on a fixed 360 × 640 portrait field.
  Time is in **seconds**, velocities in **u/s**. Y grows downward. Origin = field top-left.
- `game.js` and `levels.js` are deterministic: no `Math.random`, no `Date`, no `performance`.

## 1. Modules, owners, dependency rules

| File | Owner | May import | Purpose |
|------|-------|-----------|---------|
| `index.html` | Mal | — | DOM skeleton (§9) |
| `src/main.js` | Mal | everything below | Bootstrap, loop, wiring, storage sync, test hook |
| `src/config.js` | Mal | nothing | Shared constants, frozen. **Verbatim from §3** (coordinator creates it before fan-out) |
| `src/levels.js` | Kaylee | `config.js` | Wave layouts + per-wave parameters |
| `src/game.js` | Kaylee | `config.js`, `levels.js` | Pure game logic. **No DOM, no storage, no audio** |
| `src/storage.js` | Kaylee | nothing | localStorage high score (only `main.js` imports it) |
| `src/render.js` | Wash | `config.js` | Canvas drawing, HUD, overlays, scaling, coordinate mapping |
| `styles.css` | Wash | — | Layout, safe areas, toolbar buttons |
| `src/input.js` | River | `config.js` | Pointer/touch/keyboard/buttons → Intent; page lifecycle → forcePause |
| `src/audio.js` | River | nothing (`config.js` allowed) | Web Audio synth, mute, iOS unlock |

Forbidden: `render.js`, `input.js`, `audio.js` importing `game.js`/`levels.js`; `game.js`
importing `storage.js`/`render.js`/`input.js`/`audio.js`. Only `main.js` connects modules.
Render treats `state` as **read-only**.

## 2. Coordinate system & screen layout (decision: letterboxed portrait field)

- The field is **always 360 × 640 u portrait**, in both orientations. It is scaled uniformly
  (`scale = min(stageCssW / 360, stageCssH / 640)`) and centered in `#stage`; leftover area is
  letterbox, painted by render in the background color.
- In **landscape** the same portrait field is letterboxed (centered, tall, bars at the sides)
  and the toolbar (§9) moves to a vertical column at the side so it costs no height.
- The canvas element fills `#stage` entirely (CSS 100% × 100%); its backing store is
  `round(cssW * dpr) × round(cssH * dpr)` with `dpr = min(window.devicePixelRatio || 1, 3)`.
  Touches on the letterbox area still count (drag works anywhere on the stage).
- Field bands (logical units):
  - `0 ≤ y < 48` — HUD band (drawn by render inside the field). `CEIL_Y = 48` is the ceiling wall.
  - Brick grid starts at `GRID_Y = 80`.
  - Paddle center `y = 600`. Ball is lost when `ball.y - ball.r > 640`.
  - Side walls at `x = 0` and `x = 360`.

## 3. `src/config.js` (verbatim — create exactly this file)

```js
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
```

## 4. Game state (`src/game.js` owns; everyone reads)

The state object is created once by `createGame` and **its identity never changes** (restart
mutates it in place). Every field below must exist from creation, with these types.

```ts
type Phase = 'title' | 'serve' | 'playing' | 'waveClear' | 'gameOver';

interface GameState {
  phase: Phase;
  paused: boolean;          // orthogonal flag; only ever true in serve|playing|waveClear
  time: number;             // s, simulated time since createGame; frozen while paused
  phaseTime: number;        // s since current phase was entered; frozen while paused

  wave: number;             // 1-based; 1 on title screen
  score: number;            // integer
  highScore: number;        // integer; max(stored high, score) at all times
  startHighScore: number;   // high score at start of current game
  highScoreBeaten: boolean; // score > startHighScore during this game
  lives: number;            // integer, START_LIVES at game start
  combo: number;            // brick hits since ball last touched paddle
  multiplier: number;       // = min(MULT_CAP, max(1, combo)); integer 1..5
  lastWaveBonus: number;    // bonus awarded at the most recent wave clear (0 before any)

  paddle: {
    x: number;              // center x, u; clamped to [w/2, FIELD_W - w/2]
    y: number;              // center y, u (= PADDLE_Y)
    w: number;              // width, u (wave-dependent)
    h: number;              // height, u (= PADDLE_H)
    vx: number;             // measured u/s over the last step (for launch direction / FX)
  };

  ball: {
    x: number; y: number;   // center, u
    r: number;              // = BALL_R
    vx: number; vy: number; // u/s; 0,0 while stuck
    speed: number;          // current scalar speed u/s (|v| while moving)
    stuck: boolean;         // true in title/serve/waveClear/gameOver: rides the paddle
  };

  bricks: Brick[];          // whole wave; destroyed bricks stay with alive=false
  bricksRemaining: number;  // count of alive bricks

  events: GameEvent[];      // appended by update(); cleared ONLY by main.js each frame
}

interface Brick {
  id: number;               // unique within the wave, = row * BRICK_COLS + col
  col: number; row: number; // grid coords
  x: number; y: number;     // TOP-LEFT corner, u
  w: number; h: number;     // = BRICK_W, BRICK_H
  hp: number;               // remaining hits, 0 when destroyed
  maxHp: number;            // 1 | 2 | 3 (render colors by maxHp, shades by hp)
  points: number;           // = BRICK_POINTS[maxHp]
  alive: boolean;
}
```

While `ball.stuck`: `ball.x = paddle.x`, `ball.y = paddle.y - paddle.h/2 - ball.r - 1`.
During `waveClear` and `gameOver` render may hide the ball (it is stuck and irrelevant).

## 5. Phase state machine

```
            launch                    launch
 'title' ─────────► 'serve' ───────────────► 'playing'
                      ▲  ▲                      │  │
       lives > 0      │  │ WAVE_CLEAR_TIME      │  │ bricksRemaining == 0
  (ball lost) ────────┘  └─── 'waveClear' ◄─────┘  │  (bonus added, wave++ on exit)
                                                   │ ball lost && lives == 0
 'gameOver' ◄──────────────────────────────────────┘
     │ launch && phaseTime >= GAME_OVER_LOCK
     └────────► startGame() → 'serve'  (title is shown only once, at boot)
```

Transitions (all inside `update`):

| From | Trigger | Effect |
|------|---------|--------|
| title | `intent.launch` | `startGame()`: score 0, lives 3, wave 1, combo 0, `startHighScore = highScore`, `highScoreBeaten = false`, build wave 1, paddle centered, ball stuck → `serve`. Events `start`, `waveStart{wave:1}` |
| serve | `intent.launch` | ball unstuck at `waveSpeed`, angle `LAUNCH_DEG` from vertical, toward `sign(paddle.vx)` (0 → right), upward → `playing`. Event `launch` |
| playing | ball lost | `lives -= 1`, combo 0, event `lifeLost{lives}`. If `lives > 0` → ball stuck, speed reset to wave speed → `serve`. Else → `gameOver`, event `gameOver{...}` |
| playing | `bricksRemaining === 0` (checked after collisions each step; also catches `debugClearWave`) | `lastWaveBonus = 200*wave + 100*lives`, added to score (high-score check applies), ball stuck, event `waveClear{wave, bonus}` → `waveClear` |
| serve | `bricksRemaining === 0` (only via `debugClearWave`) | same as the row above |
| waveClear | `phaseTime >= WAVE_CLEAR_TIME` | `wave += 1`, `buildWave(wave)`, paddle `w` from `waveParams`, combo 0, ball stuck → `serve`. Event `waveStart{wave}` |
| gameOver | `intent.launch && phaseTime >= GAME_OVER_LOCK` | `startGame()` → `serve` (events as in title row) |

`phaseTime` resets to 0 on every phase change.

**Pause** (flag, not a phase):
- `intent.pauseToggle` toggles `paused` when phase ∈ {serve, playing, waveClear}; ignored otherwise.
- `intent.forcePause` sets `paused = true` when phase ∈ {serve, playing, waveClear}; idempotent.
- While paused: `intent.launch` unpauses (tap to resume) and does **not** launch the ball.
- While paused nothing else simulates: no movement, `time`/`phaseTime` frozen.
- Every change of `paused` emits `pause{paused}`.
- Never auto-resume (returning to the tab leaves the game paused).

## 6. Events (`state.events`)

Each event is a plain object `{ type: string, ...payload }`, pushed in occurrence order.
Consumers: `audio.play(e.type, e)` for every event; render may read them (particles, flashes)
during `draw`. Neither consumer mutates or removes them. **main.js empties the array after
audio and draw each frame** (`state.events.length = 0`). `update` never clears it.

| type | payload | when |
|------|---------|------|
| `start` | — | new game begins |
| `waveStart` | `wave` | wave built (incl. wave 1) |
| `launch` | — | ball leaves paddle |
| `paddle` | `x` (hit x, u), `offset` (-1..1) | ball bounces off paddle |
| `wall` | `side`: `'left'｜'right'｜'top'` | ball bounces off a wall/ceiling |
| `brick` | `id`, `x`, `y` (brick center, u), `hp` (remaining), `maxHp`, `destroyed` (bool), `points` (awarded, already multiplied; 0 if not destroyed), `multiplier` | any brick hit |
| `lifeLost` | `lives` (remaining) | ball fell out |
| `waveClear` | `wave` (cleared wave), `bonus` | entering waveClear |
| `highScore` | `score` | **once per game**, the first moment `score > startHighScore` **and** `startHighScore > 0` |
| `gameOver` | `score`, `highScore`, `isNewHigh` (= highScoreBeaten) | entering gameOver |
| `pause` | `paused` (bool) | paused flag changed |

Audio must ignore unknown types silently. Render must tolerate any event list (incl. empty).

## 7. Scoring (exact)

1. Every brick hit: `combo += 1`; `multiplier = min(MULT_CAP, max(1, combo))`; `hp -= 1`.
2. If `hp` reaches 0: brick destroyed, `alive = false`, `bricksRemaining -= 1`,
   `score += points * multiplier` (`points = BRICK_POINTS[maxHp]`: 10 / 30 / 60).
   Non-destroying hits award 0 points but still count toward combo.
3. Ball touches paddle → `combo = 0`, `multiplier = 1`. Also reset on life lost and wave start.
4. Wave clear bonus: `200 * wave + 100 * lives` (lives remaining at clear time).
5. After **any** score change: if `score > highScore` then `highScore = score`; if
   `score > startHighScore` and not `highScoreBeaten` → `highScoreBeaten = true` and (if
   `startHighScore > 0`) emit `highScore`. main.js persists it the same frame (§11).
6. At most one brick is hit per simulation step (resolve the nearest contact only).

## 8. Physics rules (Kaylee implements; binding where stated)

- Paddle movement per step, in this order: if `intent.pointerX !== null` → `paddle.x = pointerX`;
  then `paddle.x += intent.dragDX`; then `paddle.x += intent.axis * PADDLE_KEY_SPEED * dt`;
  clamp. Paddle moves in serve and playing (and the stuck ball follows); frozen while paused,
  in waveClear, title and gameOver it may move freely (cosmetic) or stay — owner's call.
- Paddle bounce: only when `vy > 0` and the ball overlaps the paddle rect.
  `offset = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1)`,
  `angle = offset * PADDLE_MAX_BOUNCE_DEG`, `speed = min(speed * 1.02, waveSpeed * 1.25, 640)`,
  `vx = speed * sin(angle)`, `vy = -speed * cos(angle)`; place ball above paddle.
- Walls: reflect and reposition inside (`x ∈ [r, 360 - r]`, `y ≥ CEIL_Y + r`).
- Bricks: circle vs AABB; reflect on the axis of least penetration; reposition out of the brick.
- After any wall/brick bounce enforce `|vy| ≥ speed * BALL_MIN_VY_FRACTION` (keep `speed`).
- `levels.waveParams(wave)` (§10) is the only source of wave speed and paddle width.

## 9. DOM — `index.html` skeleton (exact ids; Mal writes this file)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="SHATTERLINE">
  <meta name="format-detection" content="telephone=no">
  <meta name="theme-color" content="#07080f">
  <title>SHATTERLINE</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div id="toolbar" role="toolbar" aria-label="Game controls">
      <button id="pause-btn" type="button" aria-pressed="false" aria-label="Pause" disabled>PAUSE</button>
      <button id="sound-btn" type="button" aria-pressed="false" aria-label="Sound">SOUND: OFF</button>
    </div>
    <div id="stage">
      <canvas id="game" role="img" aria-label="SHATTERLINE playfield"></canvas>
    </div>
  </div>
  <noscript>SHATTERLINE needs JavaScript.</noscript>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

| id | element | owner of behavior | notes |
|----|---------|-------------------|-------|
| `app` | div | Wash (CSS) | fills the viewport, padded by `env(safe-area-inset-*)` |
| `toolbar` | div | Wash (CSS) | portrait: horizontal row above `#stage`; landscape: vertical column at the right side |
| `pause-btn` | button | River listens (click → `pauseToggle`); main syncs | `aria-pressed="true"` + text `RESUME` when paused; `disabled` in title/gameOver |
| `sound-btn` | button | River listens (click → `muteToggle`); main syncs | `aria-pressed="true"` + text `SOUND: ON` when sound is on; default `false` / `SOUND: OFF` |
| `stage` | div | Wash (CSS), River (pointer surface) | flex-fills remaining space |
| `game` | canvas | Wash (render) | CSS 100% × 100% of `#stage`, `display:block` |

**All overlays (title, paused, wave clear, game over) and the HUD are drawn on the canvas by
render.js** — no extra DOM. Only the two toolbar buttons are DOM.

`styles.css` requirements (Wash): `html, body` margin 0, `height:100%`, `overflow:hidden`,
`overscroll-behavior:none`, explicit dark background; `body` `position:fixed; inset:0`;
`#app` height `100vh` then `100dvh`, `display:flex`, `flex-direction:column` (portrait) /
`row` with toolbar on the right (`@media (orientation: landscape)`), padding
`env(safe-area-inset-top|right|bottom|left)`; `touch-action:none`,
`-webkit-user-select:none`, `user-select:none`, `-webkit-touch-callout:none`,
`-webkit-tap-highlight-color:transparent` on `#app` and descendants; buttons ≥ 44 × 44 CSS px,
`touch-action:manipulation`, visible focus style, distinct pressed style via
`[aria-pressed="true"]`, `[disabled]` dimmed; `#stage { flex:1; min-width:0; min-height:0;
position:relative }`. System font stack only (e.g. `ui-monospace, Menlo, Consolas, monospace`).

## 10. Exported APIs (exact signatures)

### `src/levels.js` (Kaylee)

```js
export function waveParams(wave: number): {
  ballSpeed: number,      // min(300 + 25*(wave-1), 520)
  ballSpeedMax: number,   // min(ballSpeed * 1.25, 640)
  paddleW: number,        // max(40, 72 - 4 * max(0, wave - 2))
}
export function buildWave(wave: number): Brick[]   // fresh array, all alive, hp = maxHp
```
- Wave 1 is **exactly 5 full rows × 10 columns, all `maxHp: 1`** (50 bricks, rows 0–4).
- Wave n ≥ 2: deterministic pattern of the owner's design, uses rows `0 .. min(4 + n, 10) - 1`,
  ≥ 24 bricks, `maxHp ∈ {1,2,3}`; hp-2 bricks appear from wave 2, hp-3 from wave 3, and the
  share of tougher bricks does not decrease as waves rise. Patterns may cycle after wave 6
  but must never get easier. Positions: `x = GRID_X + col*(BRICK_W+BRICK_GAP)`,
  `y = GRID_Y + row*(BRICK_H+BRICK_GAP)`, `id = row*BRICK_COLS + col`.

### `src/game.js` (Kaylee)

```js
export function createGame(opts?: { highScore?: number }): GameState
//   phase 'title', paused false, wave 1, score 0, lives START_LIVES, highScore = opts.highScore|0,
//   bricks = buildWave(1) (shown behind the title), ball stuck, events [].
export function update(state: GameState, dt: number, intent: Intent): void
//   Advances exactly dt seconds (main always passes STEP). Mutates state, pushes events.
//   Handles pause/launch one-shots first, then simulation. Must tolerate missing intent
//   fields (treat as NEUTRAL_INTENT values).
export function debugClearWave(state: GameState): void
//   Test hook: marks every brick dead (hp 0, alive false), bricksRemaining = 0, no points.
//   The next update() in serve/playing performs the normal waveClear transition (bonus, events).
//   No-op in title/gameOver/waveClear.
```

### `src/storage.js` (Kaylee)

```js
export function loadHighScore(): number          // parseInt of localStorage[STORAGE_KEY]; 0 if missing/invalid/throws
export function saveHighScore(score: number): boolean  // writes String(Math.floor(score)); false on any exception
```
Key: **`shatterline.highscore.v1`** (repeated here; storage.js may hard-code it). Wrap every
access in try/catch (Safari private mode). Mute state is **not** persisted (always starts muted).

### `src/render.js` (Wash)

```js
export function createRenderer(canvas: HTMLCanvasElement): {
  resize(): void,
  //   Reads canvas.clientWidth/clientHeight and devicePixelRatio (capped at 3), sets backing
  //   size, recomputes scale/offset. Idempotent, cheap; main calls it at boot and on
  //   resize / orientationchange / visualViewport resize.
  draw(state: GameState): void,
  //   Clears and paints letterbox, field, bricks, paddle, ball, HUD, overlays. Read-only on state.
  toLogical(clientX: number, clientY: number): { x: number, y: number },
  //   Client (CSS px, as in PointerEvent.clientX) → field logical units. Unclamped
  //   (may be <0 or >360 over the letterbox). Uses the canvas bounding rect + current scale/offset.
  getScale(): number,   // CSS px per logical unit (for input's tap thresholds if needed)
}
```
HUD (inside `0 ≤ y < 48`): score (left), `WAVE n` (center), `HI <highScore>` (right), lives as
small pips, multiplier `xN` shown when `multiplier ≥ 2`. Overlays:
- title: `SHATTERLINE`, `TAP / CLICK / SPACE TO START`, `DRAG OR ← → TO MOVE`.
- serve (not paused): subtle `TAP TO LAUNCH` hint.
- paused: dim field, `PAUSED`, `TAP TO RESUME`.
- waveClear: `WAVE <wave> CLEAR`, `+<lastWaveBonus>`.
- gameOver: `GAME OVER`, final score, `NEW HIGH SCORE` if `highScoreBeaten`,
  `TAP TO PLAY AGAIN` once `phaseTime ≥ 1.0`.
Colors by `maxHp`, darker/cracked look as `hp < maxHp`. Original palette; no external assets.

### `src/input.js` (River)

```js
export function createInput(opts: {
  surface: HTMLElement,               // #stage — pointer surface
  pauseButton: HTMLButtonElement,     // #pause-btn
  soundButton: HTMLButtonElement,     // #sound-btn
  toLogical: (clientX: number, clientY: number) => { x: number, y: number },
  onGesture?: () => void,             // called SYNCHRONOUSLY inside every user-gesture handler
}): {
  poll(): Intent,     // returns current intent and resets one-shots + dragDX
  destroy(): void,    // removes all listeners
}

interface Intent {
  pointerX: number | null; // absolute paddle target, logical x (mouse/hover only), else null
  dragDX: number;          // accumulated relative touch drag since last poll, logical u (gain applied)
  axis: -1 | 0 | 1;        // held keys: left = -1, right = +1, both/none = 0
  launch: boolean;         // one-shot: primary action (start / launch / resume / restart)
  pauseToggle: boolean;    // one-shot
  forcePause: boolean;     // one-shot: page lost visibility/focus
  muteToggle: boolean;     // one-shot
}
```
Bindings:
- **Touch / pen** (Pointer Events on `surface`, `pointerType !== 'mouse'`): track one primary
  pointer with `setPointerCapture`. **Relative drag**: each move adds
  `(toLogical(new).x - toLogical(prev).x) * TOUCH_DRAG_GAIN` to `dragDX` (finger never has to
  cover the paddle). A **tap** (pointerup within `TAP_MAX_MS` and < `TAP_MAX_MOVE_PX` CSS px
  total travel) sets `launch`. Touch sets `pointerX = null`.
- **Mouse**: `pointermove` sets `pointerX = toLogical(e.clientX, e.clientY).x` (absolute, no
  button needed). Primary-button `pointerdown` on `surface` sets `launch`.
- **Keyboard** (on `window`): ArrowLeft/KeyA → axis −1, ArrowRight/KeyD → +1 (held);
  Space/Enter → `launch`; KeyP/Escape → `pauseToggle`; KeyM → `muteToggle`. Ignore key
  repeat for one-shots. `preventDefault` for Space and arrows. Any movement key press sets
  `pointerX = null` until the mouse moves again. Clear held keys on blur.
- **Buttons**: `pauseButton` click → `pauseToggle`; `soundButton` click → `muteToggle`. After
  click call `button.blur()` so Space/Enter never re-trigger the button.
- **onGesture** is invoked synchronously in `pointerdown`, `pointerup`, `keydown`, and both
  button `click` handlers (iOS needs AudioContext creation/resume inside the gesture).
- **No scroll / zoom**: non-passive `touchmove` listener on `document` with `preventDefault`;
  prevent `gesturestart`/`gesturechange` (iOS pinch) and `dblclick`; `contextmenu` on surface
  prevented.
- **Lifecycle (River owns)**: `document` `visibilitychange` (when `document.hidden`),
  `window` `pagehide`, `window` `blur` → set `forcePause`. Never auto-resume.

### `src/audio.js` (River)

```js
export function createAudio(): {
  unlock(): void,                 // sync. First call creates AudioContext (webkitAudioContext fallback)
                                  //   and plays a 1-sample silent buffer; every call resume()s if
                                  //   suspended. Safe to call on every gesture; never throws.
  setMuted(muted: boolean): void, // master gain 0/1 (short ramp); muted is the default
  isMuted(): boolean,             // true until setMuted(false)
  play(type: string, payload?: object): void,
                                  // synth SFX for event types in §6; no-op if muted, no context,
                                  //   or context not running; unknown types ignored; never throws
}
```
`createAudio()` itself must **not** create an AudioContext. Suggested voices: brick (pitch
rises with `multiplier`, lower for non-destroying hits), paddle, wall, launch, lifeLost,
waveClear (arpeggio), highScore (bright jingle), gameOver (falling tone), start, pause (soft
tick). Keep total polyphony bounded (e.g. ≤ 12 live voices). River may suspend the context on
`visibilitychange` hidden; `unlock()` on the next gesture resumes it.

## 11. Integration — `src/main.js` (Mal), pseudocode

```js
import * as C from './config.js';
import { createGame, update, debugClearWave } from './game.js';
import { loadHighScore, saveHighScore } from './storage.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game'), pauseBtn = $('pause-btn'), soundBtn = $('sound-btn');

let savedHigh = loadHighScore();
const state = createGame({ highScore: savedHigh });
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput({ surface: $('stage'), pauseButton: pauseBtn, soundButton: soundBtn,
                            toLogical: (x, y) => renderer.toLogical(x, y),   // never pass unbound
                            onGesture: () => audio.unlock() });

const resize = () => renderer.resize();
addEventListener('resize', resize); addEventListener('orientationchange', resize);
window.visualViewport?.addEventListener('resize', resize); resize();

// One-shots must never be lost when a frame runs 0 substeps: accumulate into `pending`.
let pending = { ...C.NEUTRAL_INTENT };
let injected = {};                                // test hook one-shots
function gatherIntent() {
  const i = { ...input.poll(), ...takeInjected() };
  pending.pointerX = i.pointerX; pending.axis = i.axis;
  pending.dragDX += i.dragDX;
  for (const k of ['launch','pauseToggle','forcePause','muteToggle']) pending[k] ||= !!i[k];
}
function consumeIntent() {                        // full intent for first substep, then carry-only
  const out = pending;
  pending = { ...C.NEUTRAL_INTENT, pointerX: out.pointerX, axis: out.axis };
  return out;
}

function stepOnce() {
  const intent = consumeIntent();
  if (intent.muteToggle) { audio.setMuted(!audio.isMuted()); }
  update(state, C.STEP, intent);
}

function afterSim() {
  for (const e of state.events) audio.play(e.type, e);
  if (state.highScore > savedHigh) { saveHighScore(state.highScore); savedHigh = state.highScore; }
  renderer.draw(state);                           // may read state.events
  state.events.length = 0;
  syncButtons();                                  // aria-pressed/text/disabled, only on change
}

let last = performance.now(), acc = 0, running = true;
function frame(now) {
  if (!running) return;
  acc += Math.min((now - last) / 1000, C.MAX_FRAME_DT); last = now;
  gatherIntent();
  let n = 0;
  while (acc >= C.STEP && n < C.MAX_STEPS) { stepOnce(); acc -= C.STEP; n++; }
  if (n === C.MAX_STEPS) acc = 0;                 // drop backlog after a stall
  afterSim();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('pagehide', persistHighScore);   // same guard as afterSim: only if > savedHigh

function syncButtons() {
  // pause-btn: aria-pressed = paused, text 'RESUME'|'PAUSE', disabled when phase is title|gameOver
  // sound-btn: aria-pressed = !audio.isMuted(), text 'SOUND: ON'|'SOUND: OFF'
}

window.__shatterline = { /* §12 */ };
```

Rules main.js guarantees to the other modules: `update` is only ever called with `dt === STEP`;
the first substep of a frame carries all one-shots; `state.events` is emptied once per frame
after `audio.play` and `draw`; `draw` is called once per animation frame even if 0 substeps ran.

## 12. Test hook — `window.__shatterline` (for Zoe, headless Chrome)

Always installed (no flag). Shape:

```ts
window.__shatterline = {
  version: 1,
  readonly state: GameState,          // live object (same identity forever)
  config: typeof import('./config.js'),
  press(action: 'launch' | 'pause' | 'forcePause' | 'mute'): void,
                                      // queues the one-shot (launch|pauseToggle|forcePause|muteToggle)
                                      // into the next intent, through the same path as real input
  setPaddleX(x: number): void,        // queues pointerX = x for the next intent (one frame)
  step(n?: number): void,             // synchronously gathers intent, runs n (default 1) STEP
                                      // substeps, then afterSim() once (audio, save, draw, clear events)
  clearWave(): void,                  // debugClearWave(state); next step performs the wave clear
  stop(): void, start(): void,        // halt / resume the rAF loop (deterministic stepping)
  readonly running: boolean,
  audio: { isMuted(): boolean },      // read-only view of audio state
  events: GameEvent[],                // copy of events from the most recent afterSim (before clear)
}
```

Factory methods returned by `createRenderer`/`createInput`/`createAudio` must not depend on
`this` (they may be called detached); main wraps them anyway.

For deterministic stepping, call `stop()` first: while the rAF loop runs it also consumes
queued `press`/`setPaddleX` input and advances time between your calls. `step()` works in
either mode and always runs exactly `n` substeps (it is not limited by `MAX_STEPS`).

Smoke script expectations (Zoe may rely on these): on load `state.phase === 'title'`,
`audio.isMuted() === true`, `#sound-btn[aria-pressed="false"]`; `press('launch'); step()` →
`phase === 'serve'`, `bricks.length === 50`; `press('launch'); step()` → `phase === 'playing'`;
`clearWave(); step()` → `phase === 'waveClear'`, `score === 200*1 + 100*3 = 500`;
`step(Math.ceil(1.6/STEP)+1)` → `phase === 'serve'`, `wave === 2`; `press('forcePause'); step()`
→ `paused === true`; a raised score above the stored high writes
`localStorage['shatterline.highscore.v1']` within the same `step()`.

## 13. Ownership of cross-cutting concerns (summary)

| Concern | Owner |
|---------|-------|
| Pause on tab switch (visibilitychange / pagehide / blur → forcePause) | River (input.js); game applies it |
| AudioContext create/resume on gesture | River (audio.unlock), triggered via input `onGesture`, wired by main |
| Mute toggle state | audio.js; toggled by main on `muteToggle`; button UI synced by main |
| High score persistence | game computes `highScore`; main saves via storage.js the frame it rises |
| Viewport scaling / DPR / letterbox / client→logical mapping | Wash (render.js) |
| Safe areas, no page scroll/zoom (CSS) | Wash; JS gesture suppression: River |
| Fixed-timestep loop, event draining, DOM button sync, test hook | Mal (main.js) |
