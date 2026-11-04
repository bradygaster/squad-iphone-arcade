# SHATTERLINE — Review Gate (Zoe)

- **Date:** 2026-11-04
- **Commit reviewed:** `242ba16` (`git rev-parse --short HEAD`), clean product tree; only `tests/` and this file are new.
- **Contract:** `docs/contract.md` v1 (+ v1.1 clarifications in Mal's inbox note).
- **Verdict:** **APPROVE** (0 blocking, 4 non-blocking)

## Commands run (actual results)

| Command | Result |
|---|---|
| `node --check src/{audio,config,game,input,levels,main,render,storage}.js` | all 8 `OK`, exit 0 |
| `diff <(contract §3 block) src/config.js` | no output: config.js is verbatim |
| `grep -rniE "breakout\|atari" index.html styles.css src/` | no matches |
| `grep -rnE "https?://" index.html styles.css src/` | 1 match: the SVG `xmlns` inside the `data:` favicon (namespace string, not a request) |
| `grep -nE "Math.random\|Date\|performance" src/game.js src/levels.js` | no matches (deterministic) |
| `grep export default` / top-level DOM access in non-main modules | none |
| `node tests/smoke.mjs <scratchpad>/shots` | **173/173 checks passed, exit 0**, ~80 s |

`tests/smoke.mjs` starts `python3 -m http.server` on a free port bound to 127.0.0.1. It launches headless Chromium (Playwright 1.63, `chromium.launch()`, Chromium 153) and runs seven scenarios. The first screenshot argument chooses where screenshots go; the default is `tests/out/`.

1. **Core flow, portrait (§5, §7, §12):** title, muted, `SOUND: OFF`/`aria-pressed=false`, PAUSE disabled, hook shape, §4 state fields. title→serve (50 bricks, geometry/ids), serve→playing (300 u/s, 15°). Waves 1–4 are cleared through `clearWave()`, with bonus = 200·wave + 100·lives each time (500 / 700 / 900 / 1100 → scores 500 / 1200 / 2100 / 3200). `localStorage` equals the score **in the same `step()`** at every clear. Waves 2–5 are checked for paddle width 72/68/64/60, rows, hp-2/hp-3 presence, ids/positions and combo reset. Wave-5 launch speed is 400. After a reload, the high score loads from storage.
2. **Genuine play (stored high 150):** 42,293 single steps (352 s of sim time). The paddle tracks the ball with a varying offset. Results: 115 brick hits, 125 paddle hits, 2 real wave clears, reached wave 3, max multiplier 5, no ball lost. An independent model of §7 replays every event: the multiplier, the points (0 for non-destroying hits) and the wave bonus all match, and the final score (2790) equals the sum of events. The `highScore` event fired exactly once, and localStorage was written **on the step the stored 150 was beaten**. `|vy| ≥ 0.35·speed` and the walls/ceiling held on every step. A forced loss gives lifeLost 2,1,0, then gameOver with `isNewHigh:true`. Restart is locked for 1 s, then restart works.
3. **Pause:** `visibilitychange` with `document.hidden` overridden → paused, `pause` event, button shows `RESUME`/`aria-pressed=true`. After returning to the tab plus 240 steps, the game is **still paused**, with ball, time and phaseTime frozen. A tap resumes without relaunching. A `blur` with the live rAF loop running pauses and stays paused, with time frozen. Tapping PAUSE toggles both ways. `pagehide` pauses. In waveClear, forcePause holds the wave timer.
4. **SOUND:** a touch tap / click / KeyM / `press('mute')` flips `isMuted`, `aria-pressed` and the text each time. It never starts the game, and the button is blurred afterwards. 1,500 steps of unmuted play with the AudioContext live produced no errors.
5. **Portrait 390×844 and 6. landscape 844×390** (DPR 3, isMobile, hasTouch): canvas visible, inside the viewport, filling `#stage`, backing store = round(client·dpr). No page scroll (scrollW/H ≤ viewport, wheel does nothing). Both buttons ≥ 44×44 and inside the viewport. Toolbar is a row above the stage in portrait and a column at the right in landscape, with the field letterboxed. A touch tap starts and launches. A CDP touch drag of −60 px moves the paddle by dx/scale·1.2 (relative drag, within 1.5 u). A drag that starts on the landscape letterbox also moves the paddle.
7. **Desktop mouse/keyboard:** a click starts the game. Mouse move gives an absolute pointerX (within 0.6 u). ArrowRight held for 0.5 s moves +240 u. Space launches. P pauses.

Every scenario ended with **0 console errors/warnings, 0 page errors, 0 failed requests, 0 HTTP ≥ 400 responses, 0 external requests**.

### Visual check (screenshots read by reviewer)
- Portrait title: the `SHATTERLINE` neon title, `TAP / CLICK / SPACE TO START`, `DRAG OR ← → TO MOVE` and `HI 3200` are drawn over the dimmed 5×10 grid. The HUD shows score, `WAVE 1`, `HI` and 3 life pips. PAUSE is dimmed (disabled). Clean and legible.
- Portrait play: bricks are cyan, the ball has a glow and trail, and the paddle is lime. The HUD shows `HI` in gold with a `NEW HI` tag after the stored high was beaten.
- Portrait game over (wave 3): bricks are amber/magenta/cyan by maxHp, with pips on tough bricks. `GAME OVER`, `2850` and `NEW HIGH SCORE` are shown. Correct.
- Landscape play/paused: the portrait field is centred with side letterbox, and the toolbar column is at the right. Paused shows the veil, `PAUSED` and `TAP TO RESUME`. The RESUME button renders as cyan with dark text once its 120 ms CSS transition settles; an immediate screenshot caught it mid-transition.
- No Breakout/Atari naming anywhere in the UI.

## Per-module contract check

| Module | Owner | Imports (§1) | Import-time side effects (§0) | Exports / signatures (§10) | Notes | Result |
|---|---|---|---|---|---|---|
| `src/config.js` | Mal | none | none | verbatim §3 (diff empty) | | PASS |
| `src/levels.js` | Kaylee | config | none | `waveParams`, `buildWave` | Wave 1 is 5×10 hp1. Waves 2+ use rows `min(4+n,10)`, ≥24 bricks, hp2 from wave 2 and hp3 from wave 3, a non-decreasing tough share, and a full grid from wave 7. Deterministic. | PASS |
| `src/game.js` | Kaylee | config, levels | none | `createGame`, `update`, `debugClearWave` | §4 state is complete and its identity is stable. §5 transitions and pause precedence are correct, with no auto-resume. §6 events and their order are correct. §7 scoring is verified exactly. §8 physics: sub-moves of ≤ r/2 prevent tunnelling, and min-vy is enforced. | PASS |
| `src/storage.js` | Kaylee | none | none | `loadHighScore`, `saveHighScore` | try/catch around all access. Key `shatterline.highscore.v1`. Mute is not persisted. | PASS |
| `src/render.js` | Wash | config | none | `createRenderer → {resize, draw, toLogical, getScale}`, closures (no `this`) | Read-only on state. DPR capped at 3. Letterbox. HUD and all overlays are on the canvas. Original palette. | PASS (NB-2) |
| `styles.css` | Wash | — | — | §9 CSS requirements | overflow hidden, fixed body, 100vh→100dvh, safe-area padding, touch-action, user-select, buttons ≥44 with `manipulation`, focus-visible, pressed and disabled styles, system monospace font | PASS |
| `src/input.js` | River | config | none | `createInput → {poll, destroy}` | Touch uses relative drag ×1.2 and tap detection. Mouse sets absolute pointerX. Keys work as specified. Buttons blur after click. onGesture fires in pointerdown/up, keydown and clicks. touchmove/gesture/dblclick are prevented. visibilitychange/pagehide/blur → forcePause. | PASS |
| `src/audio.js` | River | none | none | `createAudio → {unlock, setMuted, isMuted, play}` | No AudioContext until `unlock()`. Muted by default. Unknown event types are ignored. ≤12 voices. Never throws. | PASS |
| `index.html` | Mal | — | — | §9 ids, attributes and meta tags | Only the favicon differs from the skeleton. | PASS (NB-1) |
| `src/main.js` | Mal | all | yes (only allowed module) | §11 loop and §12 hook | Accumulated one-shots. `step(n)` is uncapped. Save happens the same frame (verified). Events are drained after audio and draw. Button sync only on change. ResizeObserver plus orientation re-measure. Hook is frozen. | PASS |

## Findings

### BLOCKING
None.

### NON-BLOCKING

| ID | File:line | Owner | Finding | Suggested fix |
|---|---|---|---|---|
| NB-1 | `index.html:13` | Mal | The favicon is an inline SVG `data:` URI, while the §9 skeleton says `href="data:,"`. It makes no network request (verified), but it does not match the "exact" skeleton. | Either update §9 to allow an inline data-URI icon, or revert to `data:,`. |
| NB-2 | `src/render.js:85-95` | Wash | `resize()` uses integer `clientWidth/Height`. In landscape 844×390 the canvas CSS box is 702.78 px wide but the backing store is sized for 703. The result is a ~1 device-px horizontal stretch, plus a ≤0.5 CSS-px skew between `offX` and the `getBoundingClientRect` used by `toLogical`. It is not visible and does not affect gameplay. | Size from `canvas.getBoundingClientRect()` (fractional) in `resize()`, or round the `#stage` width in CSS. |
| NB-3 | `src/render.js:315`, `:361` | Wash (Mal to rule) | On a first-ever game (stored high 0), the HUD `NEW HI` tag and the game-over `NEW HIGH SCORE` appear for any score > 0, even though the `highScore` event is correctly suppressed. This follows the literal contract (`highScoreBeaten`), but players may find it odd. Already flagged in Wash's inbox note. | Mal decides; possibly gate the HUD tag on `startHighScore > 0`. |
| NB-4 | `styles.css:561-598`, contract §2 | Wash / Mal | In portrait 390×844 the uniformly scaled field leaves ~47 px empty bands above the HUD and below the field. This is by design (§2 letterbox), but a phone-sized space goes unused. | Optional: anchor the field to the top of `#stage` in portrait (offY = 0), or give the bottom band to a larger touch zone. Needs a contract note. |

## Verdict

**APPROVE.** No console errors. No external requests. Every spec requirement was exercised and passes:
- muted by default
- SOUND toggle with `aria-pressed`
- high score saved on the step it is beaten
- pause on tab switch/blur/pagehide without auto-resume
- waves with escalating params
- exact multiplier and bonus math
- portrait and landscape layout with touch tap/drag on an iPhone-sized viewport

The non-blocking items can go to the next iteration. Under reviewer lockout, fixes go to a non-author (NB-1 → Wash or Kaylee, NB-2/NB-4 → Mal, NB-3 → Mal to rule).

Re-run with: `node tests/smoke.mjs [screenshotDir]`.

## Device check (post-review)

- **2026-11-04, real iPhone (Safari, via the published Artifact page):** the owner played the game on their iPhone and reported it "worked great". This covers the one gap the headless gate could not: real touch input and Safari rendering on hardware. No new findings.
- Gameplay GIF in the README (`docs/media/shatterline.gif`) was recorded with `tests/capture-gif.cjs` driving `window.__shatterline` in headless Chromium against the committed code: 262 frames, 0 page errors.
