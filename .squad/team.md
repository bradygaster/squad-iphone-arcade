# Squad Team

> squad-iphone-arcade

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Mal | Lead / Architect | `.squad/agents/mal/charter.md` | ✅ Active |
| Kaylee | Gameplay Engineer | `.squad/agents/kaylee/charter.md` | ✅ Active |
| Wash | Rendering/UI Engineer | `.squad/agents/wash/charter.md` | ✅ Active |
| River | Input & Audio Engineer | `.squad/agents/river/charter.md` | ✅ Active |
| Zoe | Tester/Reviewer | `.squad/agents/zoe/charter.md` | ✅ Active |
| Scribe | Scribe (built-in) | `.squad/agents/scribe/charter.md` | ✅ Active |

## Project Context

- **Project:** squad-iphone-arcade
- **Created:** 2026-11-04

- **Casting universe:** Firefly (custom theme; crew of the good ship *Serenity*). Mal captains/architects, Kaylee keeps the engine (game loop) running, Wash flies the screen, River hears and feels everything (input & audio), Zoe is the steady second who signs off.
- **What we're building:** SHATTERLINE, a touch-first browser brick-breaker homage to the 1976 arcade classic *Breakout*. Original name, art, code and sound; no copied assets or trademarks.
- **Stack:** plain HTML + CSS + JavaScript ES modules, no build step, no dependencies, no CDNs, no external fonts/images/sounds. Canvas 2D rendering, Web Audio synthesis.
- **Assumptions (auto-confirmed, user is remote on iPhone):** iPhone Safari portrait + landscape is the primary target; desktop keyboard + mouse supported; sound muted by default; served with `python3 -m http.server`.
