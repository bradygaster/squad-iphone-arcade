# SHATTERLINE

A touch-first neon brick-breaker for the browser. Plain HTML, CSS and JavaScript ES
modules: no build step, no dependencies, no external assets. Every sound is synthesized
with Web Audio.

**Inspired by** the 1976 arcade classic *Breakout*. This is an homage only. The name,
look, code and sound are all original, and the project is not affiliated with the
original game or its owners.

## How to run

ES modules need `http://`, not `file://`. From the repo root:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

**On an iPhone:** join the same Wi-Fi network and open `http://<your-machine's-LAN-IP>:8000`
in Safari.

**Headless test:** `node tests/smoke.mjs` serves the game, drives it in headless
Chromium and checks it. It needs Playwright with Chromium installed.

## Controls

**Touch**
- **Drag anywhere** on the play area to move the paddle. The drag is relative, so your
  finger never has to cover the paddle.
- **Tap** to start, launch, resume or restart.
- **PAUSE** button pauses and resumes. **SOUND** button turns sound on or off.

**Keyboard / mouse**

| Action | Keys / mouse |
|---|---|
| Move | `←` `→` or `A` `D` (hold); or move the mouse |
| Start / launch / resume / restart | `Space`, `Enter`; or left-click |
| Pause / resume | `P` or `Esc` |
| Sound on/off | `M` |

## Rules

- You start with **3 lives**. Lose the ball off the bottom and you lose a life. At 0
  lives the game is over. Tap to play again after a 1-second lock.
- Clear every brick to finish a **wave**. Each game moves through these phases:
  title → serve → playing → wave clear → next serve … → game over.
- **Each wave escalates:**
  - The ball starts 25 u/s faster (300 at wave 1, capped at 520).
  - From wave 3, the paddle shrinks by 4 per wave (72 down to a minimum of 40).
  - The grid gains rows (5 at wave 1, up to 10).
  - The share of tough bricks rises: 2-hit bricks appear from wave 2 and 3-hit bricks
    from wave 3.
  - Waves 2–6 have their own layouts. From wave 7 the grid is full and the patterns cycle.
- Within a wave, each paddle hit speeds the ball up 2%, capped at 1.25× that wave's speed.
- **Switching tabs or apps pauses the game.** It never resumes on its own; tap to resume.
- **Sound is muted by default** and the setting is not saved. Tap SOUND or press `M` to
  turn it on.

## Scoring

- **Bricks by toughness:** 10 points for a 1-hit brick, 30 for a 2-hit brick, 60 for a
  3-hit brick. Points are awarded when the brick breaks.
- **Combo multiplier:** every brick hit since the ball last touched the paddle adds 1 to
  the combo, and this includes hits that don't break the brick. The multiplier equals the
  combo, from ×1 up to a cap of **×5**. It resets when the ball touches the paddle, when
  you lose a life and when a new wave starts.
- **Wave clear bonus:** `200 × wave + 100 × lives left`.
- **High score:** saved to `localStorage` the moment you beat it, not at game over.

## Built by a Squad

SHATTERLINE was built by a [Squad](https://github.com/bradygaster/squad) team of Claude
agents with a Firefly theme, driven from an iPhone, using Squad 2.0.0-preview.3 and the
Claude client.

| Member | Role | Built |
|---|---|---|
| **Mal** | Lead / Architect | Module contract, `src/config.js`, `index.html`, `src/main.js` loop, this README |
| **Kaylee** | Gameplay | `src/game.js`, `src/levels.js`, `src/storage.js` |
| **Wash** | Rendering / UI | `src/render.js`, `styles.css` |
| **River** | Input & Audio | `src/input.js`, `src/audio.js` |
| **Zoe** | Tester / Reviewer | `tests/smoke.mjs`, `docs/review.md`. Verdict **APPROVE**: 173/173 checks passed, 0 blocking and 4 non-blocking findings |
| **Scribe** | Scribe | Merged team decisions into `.squad/decisions.md` |

More detail:
- [`docs/contract.md`](docs/contract.md): the binding module contract
- [`docs/review.md`](docs/review.md): the review gate
- [`.squad/`](.squad/): team, routing and decisions
