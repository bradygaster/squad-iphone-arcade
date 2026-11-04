// SHATTERLINE input. Owned by River. See docs/contract.md §10 (input.js).
// Pointer/touch/mouse/keyboard/buttons -> Intent; page lifecycle -> forcePause.
// No side effects at import time: everything happens inside createInput().

import { TOUCH_DRAG_GAIN, TAP_MAX_MS, TAP_MAX_MOVE_PX } from './config.js';

const LEFT_CODES = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD']);
const LAUNCH_CODES = new Set(['Space', 'Enter', 'NumpadEnter']);
const PAUSE_CODES = new Set(['KeyP', 'Escape']);
const MUTE_CODES = new Set(['KeyM']);
// Keys whose browser default (scroll, button activation) must never happen.
const PREVENT_CODES = new Set(['Space', 'Enter', 'NumpadEnter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// Normalize KeyboardEvent to a `code`-like string (fallback for old engines without e.code).
function keyCode(e) {
  if (e.code) return e.code;
  switch (e.key) {
    case 'ArrowLeft': case 'Left': return 'ArrowLeft';
    case 'ArrowRight': case 'Right': return 'ArrowRight';
    case 'ArrowUp': case 'Up': return 'ArrowUp';
    case 'ArrowDown': case 'Down': return 'ArrowDown';
    case ' ': case 'Spacebar': return 'Space';
    case 'Enter': return 'Enter';
    case 'Escape': case 'Esc': return 'Escape';
    default:
      if (typeof e.key === 'string' && e.key.length === 1) return 'Key' + e.key.toUpperCase();
      return e.key || '';
  }
}

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

export function createInput(opts) {
  const { surface, pauseButton, soundButton, toLogical } = opts;
  const onGesture = typeof opts.onGesture === 'function' ? opts.onGesture : null;

  // ---- accumulated intent state ----
  let pointerX = null;
  let dragDX = 0;
  let launch = false;
  let pauseToggle = false;
  let forcePause = false;
  let muteToggle = false;
  const held = new Set();       // movement key codes currently held

  // ---- touch/pen primary pointer tracking ----
  let touchId = null;           // pointerId of the tracked primary touch/pen pointer
  let touchStartT = 0;
  let touchStartX = 0, touchStartY = 0; // client px
  let touchPrevLX = 0;          // previous logical x
  let touchMaxMove = 0;         // max CSS px distance from start
  let touchTapOk = true;        // false once a second finger joins (pinch etc.)

  const listeners = [];
  function on(target, type, fn, options) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(type, fn, options);
    listeners.push([target, type, fn, options]);
  }

  function gesture() {
    if (!onGesture) return;
    try { onGesture(); } catch (_) { /* audio unlock must never break input */ }
  }

  function logicalX(clientX, clientY) {
    try {
      const p = toLogical(clientX, clientY);
      return p && Number.isFinite(p.x) ? p.x : null;
    } catch (_) {
      return null;
    }
  }

  function releaseTouch(e) {
    if (touchId !== null && e && surface.releasePointerCapture) {
      try { if (surface.hasPointerCapture && surface.hasPointerCapture(touchId)) surface.releasePointerCapture(touchId); } catch (_) { /* ignore */ }
    }
    touchId = null;
  }

  function clearHeld() { held.clear(); }

  // ---- pointer events on surface ----
  function onPointerDown(e) {
    gesture();
    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        launch = true;
        const x = logicalX(e.clientX, e.clientY);
        if (x !== null) pointerX = x;
      }
      return;
    }
    // touch / pen
    if (e.cancelable) e.preventDefault();
    pointerX = null;
    if (touchId !== null) {
      // A second finger: ignore it for movement, and the gesture no longer counts as a tap.
      if (e.pointerId !== touchId) touchTapOk = false;
      return;
    }
    const x = logicalX(e.clientX, e.clientY);
    touchId = e.pointerId;
    touchStartT = now();
    touchStartX = e.clientX;
    touchStartY = e.clientY;
    touchPrevLX = x === null ? 0 : x;
    touchMaxMove = 0;
    touchTapOk = true;
    try { surface.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  function onPointerMove(e) {
    if (e.pointerType === 'mouse') {
      const x = logicalX(e.clientX, e.clientY);
      if (x !== null) pointerX = x;
      return;
    }
    if (e.pointerId !== touchId) return;
    if (e.cancelable) e.preventDefault();
    // Use coalesced events when available for smoother relative drag; the sum telescopes
    // to the same total, so this is just precision for the tap-travel check.
    const evs = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents()) || [];
    const list = evs.length ? evs : [e];
    for (const ev of list) {
      const x = logicalX(ev.clientX, ev.clientY);
      if (x === null) continue;
      dragDX += (x - touchPrevLX) * TOUCH_DRAG_GAIN;
      touchPrevLX = x;
      const d = Math.hypot(ev.clientX - touchStartX, ev.clientY - touchStartY);
      if (d > touchMaxMove) touchMaxMove = d;
    }
  }

  function onPointerUp(e) {
    gesture();
    if (e.pointerType === 'mouse') return;
    if (e.pointerId !== touchId) return;
    if (e.cancelable) e.preventDefault();
    const d = Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY);
    if (d > touchMaxMove) touchMaxMove = d;
    if (touchTapOk && now() - touchStartT <= TAP_MAX_MS && touchMaxMove < TAP_MAX_MOVE_PX) {
      launch = true;
    }
    releaseTouch(e);
  }

  function onPointerCancel(e) {
    if (e.pointerId !== touchId) return;
    // Cancelled gestures (system took over, palm rejection, ...) never produce a tap.
    releaseTouch(e);
  }

  function onLostCapture(e) {
    if (e.pointerId === touchId) touchId = null;
  }

  on(surface, 'pointerdown', onPointerDown);
  on(surface, 'pointermove', onPointerMove);
  on(surface, 'pointerup', onPointerUp);
  on(surface, 'pointercancel', onPointerCancel);
  on(surface, 'lostpointercapture', onLostCapture);

  // ---- keyboard on window ----
  function isOurButton(t) { return !!t && (t === pauseButton || t === soundButton); }
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser/OS shortcuts alone
    gesture();
    const code = keyCode(e);
    // Keyboard users who Tab onto a toolbar button keep native activation (Space/Enter -> click).
    if (LAUNCH_CODES.has(code) && isOurButton(e.target)) return;
    if (PREVENT_CODES.has(code) && e.cancelable) e.preventDefault();
    if (LEFT_CODES.has(code) || RIGHT_CODES.has(code)) {
      held.add(code);
      pointerX = null;
      return;
    }
    if (e.repeat) return;
    if (LAUNCH_CODES.has(code)) launch = true;
    else if (PAUSE_CODES.has(code)) pauseToggle = true;
    else if (MUTE_CODES.has(code)) muteToggle = true;
  }

  function onKeyUp(e) {
    const code = keyCode(e);
    if (LAUNCH_CODES.has(code) && isOurButton(e.target)) return;
    if (PREVENT_CODES.has(code) && e.cancelable) e.preventDefault();
    held.delete(code);
  }

  on(window, 'keydown', onKeyDown);
  on(window, 'keyup', onKeyUp);

  // ---- toolbar buttons ----
  // The buttons live in #toolbar, outside #surface, so their presses never reach the
  // surface's pointer handlers. stopPropagation is belt-and-braces in case of re-parenting.
  function stopPointer(e) { e.stopPropagation(); }
  function onPauseClick(e) {
    gesture();
    if (e) e.stopPropagation();
    pauseToggle = true;
    try { pauseButton.blur(); } catch (_) { /* ignore */ }
  }
  function onSoundClick(e) {
    gesture();
    if (e) e.stopPropagation();
    muteToggle = true;
    try { soundButton.blur(); } catch (_) { /* ignore */ }
  }
  for (const btn of [pauseButton, soundButton]) {
    on(btn, 'pointerdown', stopPointer);
    on(btn, 'pointerup', stopPointer);
  }
  on(pauseButton, 'click', onPauseClick);
  on(soundButton, 'click', onSoundClick);

  // ---- no scroll / zoom / callout ----
  const prevent = (e) => { if (e.cancelable) e.preventDefault(); };
  on(document, 'touchmove', prevent, { passive: false });
  on(document, 'gesturestart', prevent, { passive: false });
  on(document, 'gesturechange', prevent, { passive: false });
  on(document, 'gestureend', prevent, { passive: false });
  on(document, 'dblclick', prevent, { passive: false });
  on(surface, 'contextmenu', prevent);
  on(surface, 'selectstart', prevent);
  // Suppress iOS double-tap zoom and the synthetic click on the play surface only
  // (document-wide would break the toolbar buttons' clicks).
  on(surface, 'touchend', prevent, { passive: false });
  // Pinch with two fingers on the stage.
  on(surface, 'touchstart', (e) => { if (e.touches && e.touches.length > 1) prevent(e); }, { passive: false });

  // ---- lifecycle ----
  function lose() {
    forcePause = true;
    clearHeld();
    touchId = null;
  }
  on(document, 'visibilitychange', () => { if (document.hidden) lose(); });
  on(window, 'pagehide', lose);
  on(window, 'blur', lose);

  return {
    poll() {
      let axis = 0;
      const l = held.has('ArrowLeft') || held.has('KeyA');
      const r = held.has('ArrowRight') || held.has('KeyD');
      if (l && !r) axis = -1;
      else if (r && !l) axis = 1;
      const intent = { pointerX, dragDX, axis, launch, pauseToggle, forcePause, muteToggle };
      dragDX = 0;
      launch = false;
      pauseToggle = false;
      forcePause = false;
      muteToggle = false;
      return intent;
    },
    destroy() {
      for (const [t, type, fn, o] of listeners) {
        try { t.removeEventListener(type, fn, o); } catch (_) { /* ignore */ }
      }
      listeners.length = 0;
      clearHeld();
      touchId = null;
    },
  };
}
