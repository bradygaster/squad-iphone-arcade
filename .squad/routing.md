# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture, contract, cross-module integration | Mal | `docs/contract.md`, module boundaries, state shape, `index.html` wiring |
| Game rules, physics, waves, scoring, persistence | Kaylee | ball/paddle physics, brick layouts, multipliers, high score |
| Canvas rendering, HUD, overlays, layout, CSS | Wash | drawing, screen scaling, menus, SOUND button styling |
| Touch/keyboard/mouse input, Web Audio, lifecycle | River | pointer events, key bindings, synthesized SFX, pause on tab switch |
| Review gate, headless tests, contract verification | Zoe | `docs/review.md`, APPROVE/REJECT verdicts |
| Decision merging | Scribe | `.squad/decisions.md` |

## File Ownership

| Path | Owner | Notes |
|------|-------|-------|
| `docs/contract.md` | Mal | Source of truth for module APIs; changes need Mal |
| `index.html`, `src/main.js`, `src/config.js` | Mal | Bootstrap + game loop wiring + shared constants |
| `src/game.js`, `src/levels.js`, `src/storage.js` | Kaylee | Pure game logic, no DOM except storage |
| `src/render.js`, `styles.css` | Wash | Canvas drawing, HUD, overlays, CSS |
| `src/input.js`, `src/audio.js` | River | Input abstraction, Web Audio synth |
| `docs/review.md`, `tests/` | Zoe | Review gate + headless smoke test |
| `README.md` | Mal | Others contribute their sections |
| `.squad/decisions.md` | Scribe | Only Scribe merges; others write to `decisions/inbox/` |

**Reviewer lockout:** on a REJECT, the author of the rejected file may not fix it; the coordinator assigns the fix to a different member (default fallback: Mal for logic, Wash for UI, River for input/audio, Kaylee if Mal authored).

Preset installation adds concrete routes for the configured team. Add or edit rows
here only when their agent names also exist in the casting registry.

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.

## Work Type → Agent

| Work Type | Primary | Secondary |
|-----------|---------|----------|
| Lead / Architect | Mal | — |
| Gameplay Engineer | Kaylee | — |
| Rendering/UI Engineer | Wash | — |
| Input & Audio Engineer | River | — |
| Tester/Reviewer | Zoe | — |
