# Squad Decisions

## Active Decisions

### 2026-11-04 — Session setup calls (Coordinator)

- **Universe: Firefly** (custom; `allow_custom_universes: true`). Mal=Lead/Architect, Kaylee=Gameplay, Wash=Rendering/UI, River=Input & Audio, Zoe=Tester/Reviewer, Scribe=built-in.
- **Homage: Breakout (1976)**, titled **SHATTERLINE**. A brick-breaker suits touch (one-finger drag paddle, tap to launch) better than twin-stick classics.
- **Coordinator acted as Squad.** The `squad_state` MCP server was not loaded and subagents cannot spawn subagents, so the main session followed `.claude/agents/squad.md`, spawned members as general-purpose subagents, and decisions went to `.squad/decisions/inbox/` as plain files. (This merge was also done with plain file reads/writes for the same reason, as the coordinator authorized.)
- **One commit per member module, by the coordinator.** Members only wrote files, so there were no concurrent index writes in the shared tree.
- **Roles relabelled in team.md.** The built-in titles from `squad cast` and the generic Input & Audio charter were edited to the requested roles and SHATTERLINE file ownership. The casting registry was not touched.
- **`src/config.js` is a Mal-owned module** for shared constants (contract §3).

### 2026-11-04 — Fixed 360x640 portrait field, letterboxed in landscape (Mal)

- All gameplay uses one 360x640 logical field. It is scaled uniformly into `#stage` (DPR capped at 3) and letterboxed. In landscape it stays centered and portrait, and the toolbar moves to a side column.
- HUD and overlays are drawn on the canvas. The only DOM controls are `#pause-btn` and `#sound-btn`.
- **Why:** one set of physics and layout values, and it fits the ~350-line budget. **Trade-off:** the field is small in landscape (about 345px tall on iPhone). We accept that rather than keep a second layout and balance set.

### 2026-11-04 — game.js is pure; main.js owns I/O, events and persistence (Mal)

- `game.js` and `levels.js` import only `config.js`. They use no DOM, storage, audio or randomness, so they are deterministic.
- `update(state, STEP, intent)` mutates state and appends to `state.events`. Each frame, main.js plays audio for the events, saves the high score on the frame it rises (only main imports storage.js), calls `draw`, then clears events.
- The loop uses a fixed 1/120 s step, and one-shot intents are accumulated so none are lost. `window.__shatterline` exposes state and press/step/clearWave/stop/start for headless tests.
- **Why:** headless testing, and three engineers can build in parallel with no hidden coupling. **Trade-off:** main.js holds more glue code, and a new shared constant needs a contract edit.

### 2026-11-04 — input.js owns lifecycle, buttons and gestures; touch uses relative drag (Mal)

- input.js handles the stage, the keyboard, clicks on `#pause-btn` and `#sound-btn`, and visibilitychange, pagehide and blur. Those last three set `forcePause`, and the game never auto-resumes.
- Every gesture handler calls `onGesture()` (which is `audio.unlock`) synchronously, as iOS requires.
- Touch uses relative drag (gain 1.2) with tap to launch. The mouse uses absolute `pointerX`, and keys give an axis. Audio starts muted, and mute is not persisted.
- **Why:** every user and page signal goes through one module into one Intent, and the finger stays off the paddle. **Trade-off:** touch cannot teleport the paddle, which the 1.2 gain makes up for.

### 2026-11-04 — Contract v1.1 clarifications, no signature changes (Mal)

Edits to `docs/contract.md`. No name, signature, field or unit changed.
1. Methods returned by `createRenderer`, `createInput` and `createAudio` must not depend on `this` (§12). The §11 pseudocode now wraps `(x, y) => renderer.toLogical(x, y)`. Closures are fine.
2. `pagehide` uses the same guarded save as `afterSim`: it saves only when `highScore > savedHigh`, so it can't overwrite a higher value saved by another tab.
3. Deterministic tests must call `__shatterline.stop()` first, because the live rAF loop also consumes queued input. `step(n)` always runs exactly `n` substeps and is not capped by `MAX_STEPS`.
- **Also in main.js (impl only):** a ResizeObserver on `#stage` and a delayed re-measure after `orientationchange` (iOS reports stale sizes). Both call the idempotent `renderer.resize()`.

### 2026-11-04 — Gameplay: collision substeps, pause/launch precedence, wave curve (Kaylee)

- **Collision:** each 1/120 s step moves the ball in sub-moves of at most `BALL_R/2` (3 sub-moves at the 640 u/s cap), and everything is checked after each one. Bricks use circle-vs-AABB: the deepest-overlapping brick is resolved by reflecting on the axis of least penetration, and the ball is pushed out. Only one brick hit counts per step (§7.6). Walls reflect and emit `wall` only when the ball moves into them. After each bounce, `|vy| >= 0.35*speed` is enforced and `|v| == speed` is kept.
- **Paddle:** a bounce needs `vy > 0`, an overlap, and the ball centre not below the paddle's bottom edge. A ball already past the paddle is lost; it is not snapped back.
- **Pause precedence:** `pauseToggle` is applied first, then `forcePause` (always ends paused). `launch` resumes only if the game was already paused and no `forcePause` came with it, and a resume never also launches. A `debugClearWave` while paused takes effect on the next unpaused update.
- The paddle, and a stuck ball, follow input in every unpaused phase (cosmetic in title, waveClear and gameOver).
- **Event order:** `brick` → `highScore`, `start` → `waveStart`, `lifeLost` → `gameOver`, bonus `highScore` → `waveClear`.
- Phase timers use a 1e-9 epsilon, so float drift can't add a step.
- **Waves:** waves 2–6 have their own shapes (Breakwater, Lantern, Colonnade, Lattice, Arrowhead) with 50–68 bricks. From wave 7 the grid is full (100 bricks), and the shape only places the tough bricks. The shares of hp≥2 and hp=3 bricks rise each wave and never decrease. Tough bricks fill top rows first. `buildWave` returns bricks sorted by id.
- **Why:** sub-moves smaller than the radius prevent tunnelling, and the min-vy rule plus the 60° paddle cap prevents flat loops. A headless sim (10 minutes of autoplay plus a forced 640 u/s run) found no tunnelling, no double hits, no ball out of the field and no vy violations.

### 2026-11-04 — Input and audio implementation choices (River)

- **Pointer:** one primary touch or pen pointer is tracked (setPointerCapture). A second finger is ignored and cancels the tap, and pointercancel never taps. A mouse pointerdown snaps `pointerX` to the click.
- **Keys:** keys with Ctrl, Meta or Alt are ignored so browser shortcuts still work. Enter and NumpadEnter launch. ArrowUp and ArrowDown are preventDefaulted so they don't scroll. If a toolbar button has Tab focus, Space and Enter activate the button instead of launching. Buttons are blurred after each click.
- **Gestures:** touchmove, gesture* and dblclick are prevented on the whole document. `touchend` is prevented only on `#stage`, so toolbar taps still work. Blur, pagehide and hidden also clear held keys and drop the tracked touch.
- **Audio:** master gain → DynamicsCompressor → destination. The context suspends when the page is hidden and resumes on the next unlock, including iOS's 'interrupted' state. There are at most 12 live voices, and extra notes are dropped. Noise comes from an LCG, so it is deterministic.
- All factory methods are closures with no `this` (v1.1).
- **Why:** iOS Safari quirks, and keeping keyboard accessibility without Space/Enter double-firing.

### 2026-11-04 — Render: neon look, cheap FX, contract readings (Wash)

- `src/render.js` imports only `config.js`, uses closures with no `this`, and never writes `state`. It draws in logical units under one transform (`scale*dpr` plus the letterbox offset), clipped to the field.
- **Bricks:** hue shows `maxHp` (cyan 1, magenta 2, amber 3). Damage darkens the brick and adds cracks that stay put. Pips show the remaining hits, and 3-hit bricks have reinforced corners.
- **FX (render-local):** a hit flash, a square-particle burst on kills (max 160), an 8-sample ball trail, a red flash when a life is lost, and a glow sprite pre-rendered once for the ball and paddle. shadowBlur is used only on overlay titles.
- **CSS:** the toolbar is a row above the stage in portrait and a right-hand column in landscape. Buttons are at least 44px. A pressed SOUND button is magenta and a pressed PAUSE button is cyan.
- **How ambiguities were read:**
  - While paused, only the PAUSED overlay is drawn, even in waveClear.
  - The NEW HIGH SCORE overlay on gameOver shows whenever `highScoreBeaten`, so it also appears on a first-ever game with score > 0 (see Zoe NB-3). During play, HUD `HI` turns gold and shows a "NEW HI" tag. The 1.8s toast appears only on the `highScore` event, which needs `startHighScore > 0`.
  - "TAP TO …" prompts blink on wall-clock time. Particles and flashes use `state.time`, so they freeze while paused.
  - The ball is hidden in waveClear and gameOver (§4).
- **Why:** frames stay cheap on iPhone at DPR 3 (about 100 fillRects and two glow drawImage calls), and hp states are easy to tell apart.

### 2026-11-04 — Review gate verdict for 242ba16: APPROVE (Zoe)

- `node --check` passes on all 8 modules. `node tests/smoke.mjs` passes 173/173 in headless Chromium: portrait 390×844 and landscape 844×390 with touch, plus desktop. There were 0 console or page errors and 0 failed or external requests.
- **Blocking: 0. Non-blocking: 4**, all in `docs/review.md`:
  - NB-1: the favicon is not the skeleton's `data:,` (Mal)
  - NB-2: integer clientWidth gives a sub-pixel canvas stretch (Wash)
  - NB-3: NEW HI shows on a first-ever game (Mal to rule)
  - NB-4: unused letterbox bands in portrait (Wash/Mal)
- **Why:** every spec requirement was tested with real input, not just the hook. That covers the muted default, the SOUND toggle, the high score saved on the step it is beaten, pausing on hidden, blur and pagehide with no auto-resume, waves, and the exact §7 multiplier and bonus math (checked against an independent 42k-step replay), plus both layouts with touch.
- **Process:** `tests/smoke.mjs` is now the gate (a nonzero exit means reject). Under reviewer lockout, NB fixes go to non-authors.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
