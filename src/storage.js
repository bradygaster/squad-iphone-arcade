// SHATTERLINE high-score persistence. Owner: Kaylee. Every access is guarded
// (Safari private mode, disabled storage, non-browser hosts).
const KEY = 'shatterline.highscore.v1';

function store() {
  // Accessing the global itself can throw (SecurityError) in some browsers.
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadHighScore() {
  try {
    const ls = store();
    if (!ls) return 0;
    const n = parseInt(ls.getItem(KEY), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

export function saveHighScore(score) {
  try {
    const ls = store();
    if (!ls) return false;
    const n = Math.floor(Number(score));
    if (!Number.isFinite(n)) return false;
    ls.setItem(KEY, String(n));
    return true;
  } catch (_) {
    return false;
  }
}
