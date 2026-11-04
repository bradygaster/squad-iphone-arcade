// SHATTERLINE headless smoke / playthrough test. Owner: Zoe.
// Usage: node tests/smoke.mjs [screenshotDir]
//   Serves the repo root with `python3 -m http.server` on a free port, drives headless
//   Chromium (preinstalled Playwright) through window.__shatterline (docs/contract.md §12),
//   and exits non-zero on any failed check.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.argv[2] || process.env.SHOT_DIR || path.join(ROOT, 'tests', 'out');
const KEY = 'shatterline.highscore.v1';

// ------------------------------------------------------------------ reporting
const results = [];
let section = '';
function check(name, ok, detail) {
  results.push({ section, name, ok: !!ok, detail });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${name}${!ok && detail !== undefined ? '  -> ' + JSON.stringify(detail) : ''}`);
}
function begin(s) { section = s; console.log(`\n# ${s}`); }

// ------------------------------------------------------------------ server
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}
async function startServer() {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(base + '/index.html'); if (r.ok) return { proc, base }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('http.server did not start');
}

// ------------------------------------------------------------------ page helpers
const VIEWPORTS = {
  portrait: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 } },
};

async function openPage(browser, base, kind, { preHigh } = {}) {
  const ctx = await browser.newContext(VIEWPORTS[kind]);
  if (preHigh !== undefined) {
    await ctx.addInitScript(([k, v]) => {
      if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); }
    }, [KEY, String(preHigh)]);
  }
  const page = await ctx.newPage();
  const log = { consoleErrors: [], pageErrors: [], failed: [], external: [], badStatus: [] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.consoleErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.pageErrors.push(String(e && e.stack || e)));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base + '/') && !u.startsWith('data:')) log.external.push(u); });
  page.on('response', (r) => { if (r.status() >= 400) log.badStatus.push(`${r.status()} ${r.url()}`); });
  await page.goto(base + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shatterline && window.__shatterline.version === 1, null, { timeout: 5000 });
  await page.waitForTimeout(300); // let a few rAF frames run so draw/resize errors would surface
  return { ctx, page, log };
}

function checkLog(log, label) {
  check(`${label}: zero console errors/warnings`, log.consoleErrors.length === 0, log.consoleErrors);
  check(`${label}: zero page errors`, log.pageErrors.length === 0, log.pageErrors);
  check(`${label}: zero failed requests`, log.failed.length === 0, log.failed);
  check(`${label}: zero HTTP >= 400 responses`, log.badStatus.length === 0, log.badStatus);
  check(`${label}: zero external network requests`, log.external.length === 0, log.external);
}

const H = (page, fn, arg) => page.evaluate(fn, arg);
const snap = (page) => H(page, () => JSON.parse(JSON.stringify(window.__shatterline.state)));
const lsGet = (page) => H(page, (k) => localStorage.getItem(k), KEY);

// ------------------------------------------------------------------ main
async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const { proc, base } = await startServer();
  const browser = await chromium.launch();
  try {
    await testCoreFlow(browser, base);
    await testGenuinePlay(browser, base);
    await testPause(browser, base);
    await testSound(browser, base);
    await testViewport(browser, base, 'portrait');
    await testViewport(browser, base, 'landscape');
    await testMouse(browser, base);
  } finally {
    await browser.close();
    proc.kill();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  [${f.section}] ${f.name}`);
    process.exit(1);
  }
}

// §12 smoke expectations + §7 scoring for wave bonuses + high score written during play.
async function testCoreFlow(browser, base) {
  begin('core flow (§5, §7, §12) — portrait iPhone');
  const { ctx, page, log } = await openPage(browser, base, 'portrait');
  const doc = await H(page, () => ({
    title: document.title,
    text: document.body.innerText,
    soundPressed: document.getElementById('sound-btn').getAttribute('aria-pressed'),
    soundText: document.getElementById('sound-btn').textContent,
    pauseDisabled: document.getElementById('pause-btn').disabled,
    ids: ['app', 'toolbar', 'pause-btn', 'sound-btn', 'stage', 'game'].filter((id) => !document.getElementById(id)),
    muted: window.__shatterline.audio.isMuted(),
    phase: window.__shatterline.state.phase,
    hookKeys: Object.keys(window.__shatterline).sort(),
    frozen: Object.isFrozen(window.__shatterline.config),
  }));
  check('document title is SHATTERLINE', doc.title === 'SHATTERLINE', doc.title);
  check('no "Breakout"/"Atari" in DOM text or title', !/breakout|atari/i.test(doc.text + doc.title), doc.text);
  check('all §9 DOM ids present', doc.ids.length === 0, doc.ids);
  check('initial phase === title', doc.phase === 'title', doc.phase);
  check('audio muted by default', doc.muted === true);
  check('#sound-btn aria-pressed=false, text SOUND: OFF', doc.soundPressed === 'false' && doc.soundText === 'SOUND: OFF', doc);
  check('#pause-btn disabled on title', doc.pauseDisabled === true);
  const needKeys = ['audio', 'clearWave', 'config', 'events', 'press', 'running', 'setPaddleX', 'start', 'state', 'step', 'stop', 'version'];
  check('__shatterline exposes §12 members', needKeys.every((k) => doc.hookKeys.includes(k)), doc.hookKeys);
  check('no high score stored initially', (await lsGet(page)) === null);

  // State shape (§4)
  const s0 = await snap(page);
  const fields = ['phase', 'paused', 'time', 'phaseTime', 'wave', 'score', 'highScore', 'startHighScore', 'highScoreBeaten',
    'lives', 'combo', 'multiplier', 'lastWaveBonus', 'paddle', 'ball', 'bricks', 'bricksRemaining', 'events'];
  check('§4 state has every field', fields.every((f) => f in s0), fields.filter((f) => !(f in s0)));
  check('§4 paddle/ball fields', ['x', 'y', 'w', 'h', 'vx'].every((f) => f in s0.paddle) &&
    ['x', 'y', 'r', 'vx', 'vy', 'speed', 'stuck'].every((f) => f in s0.ball), { p: s0.paddle, b: s0.ball });
  check('title shows wave-1 bricks behind it (50)', s0.bricks.length === 50 && s0.bricksRemaining === 50, s0.bricks.length);

  const idSame = await H(page, () => { window.__shatterline.stop(); window.__t0 = window.__shatterline.state; return !window.__shatterline.running; });
  check('stop() halts the loop (running === false)', idSame === true);

  await H(page, () => { window.__shatterline.press('launch'); window.__shatterline.step(); });
  let s = await snap(page);
  check('launch on title -> serve', s.phase === 'serve', s.phase);
  check('wave 1: 50 bricks, 5 rows, all maxHp 1, ids row*10+col', s.bricks.length === 50 &&
    s.bricks.every((b) => b.maxHp === 1 && b.hp === 1 && b.row < 5 && b.id === b.row * 10 + b.col &&
      b.x === 11 + b.col * 34 && b.y === 80 + b.row * 16 && b.points === 10), s.bricks.length);
  check('start: score 0, lives 3, wave 1, combo 0', s.score === 0 && s.lives === 3 && s.wave === 1 && s.combo === 0, s);
  check('ball stuck on paddle (§4 geometry)', s.ball.stuck && s.ball.x === s.paddle.x &&
    Math.abs(s.ball.y - (s.paddle.y - s.paddle.h / 2 - s.ball.r - 1)) < 1e-9, s.ball);
  const ev1 = await H(page, () => window.__shatterline.events.map((e) => e.type));
  check('events start + waveStart emitted', ev1.join(',') === 'start,waveStart', ev1);
  const pb = await H(page, () => document.getElementById('pause-btn').disabled);
  check('#pause-btn enabled in serve', pb === false);

  await H(page, () => { window.__shatterline.press('launch'); window.__shatterline.step(); });
  s = await snap(page);
  check('launch on serve -> playing, ball moving at 300 u/s', s.phase === 'playing' && !s.ball.stuck &&
    Math.abs(Math.hypot(s.ball.vx, s.ball.vy) - 300) < 1e-6 && s.ball.vy < 0, s.ball);
  check('launch angle 15deg from vertical, rightwards when paddle still', Math.abs(Math.atan2(s.ball.vx, -s.ball.vy) * 180 / Math.PI - 15) < 1e-6, s.ball);
  check('state identity unchanged', await H(page, () => window.__t0 === window.__shatterline.state));

  // Wave clears through the hook; expected bonus = 200*wave + 100*lives (§7.4)
  let expected = 0;
  for (let wave = 1; wave <= 4; wave++) {
    const r = await H(page, (k) => {
      const T = window.__shatterline;
      if (T.state.phase === 'serve') { T.press('launch'); T.step(); }
      T.clearWave(); T.step();
      return { st: JSON.parse(JSON.stringify(T.state)), ev: T.events.slice(), ls: localStorage.getItem(k) };
    }, KEY);
    const bonus = 200 * wave + 100 * 3;
    expected += bonus;
    check(`wave ${wave}: clearWave+step -> waveClear, bonus ${bonus}, score ${expected}`,
      r.st.phase === 'waveClear' && r.st.lastWaveBonus === bonus && r.st.score === expected, { phase: r.st.phase, score: r.st.score, bonus: r.st.lastWaveBonus });
    const wc = r.ev.find((e) => e.type === 'waveClear');
    check(`wave ${wave}: waveClear event {wave, bonus}`, wc && wc.wave === wave && wc.bonus === bonus, r.ev);
    check(`wave ${wave}: highScore === score`, r.st.highScore === expected, r.st.highScore);
    check(`wave ${wave}: localStorage updated in the same step() (${expected})`, r.ls === String(expected), r.ls);
    if (wave === 1) {
      check('no highScore event on first-ever game (startHighScore 0)', !r.ev.some((e) => e.type === 'highScore'), r.ev);
      check('highScoreBeaten set', r.st.highScoreBeaten === true);
    }
    const n = await H(page, () => Math.ceil(1.6 / window.__shatterline.config.STEP) + 1);
    const r2 = await H(page, (n) => { const T = window.__shatterline; T.step(n); return { st: JSON.parse(JSON.stringify(T.state)), ev: T.events.slice() }; }, n);
    const nw = wave + 1;
    check(`after ${n} steps -> serve, wave ${nw}`, r2.st.phase === 'serve' && r2.st.wave === nw, { phase: r2.st.phase, wave: r2.st.wave });
    check(`waveStart{wave:${nw}} event`, r2.ev.some((e) => e.type === 'waveStart' && e.wave === nw), r2.ev);
    const pw = Math.max(40, 72 - 4 * Math.max(0, nw - 2));
    check(`wave ${nw}: paddle w = ${pw}`, r2.st.paddle.w === pw, r2.st.paddle.w);
    const rows = Math.min(4 + nw, 10);
    const bs = r2.st.bricks;
    const maxHps = new Set(bs.map((b) => b.maxHp));
    check(`wave ${nw}: >=24 bricks, rows < ${rows}, positions/ids per §10`, bs.length >= 24 && bs.every((b) => b.row < rows &&
      b.id === b.row * 10 + b.col && b.x === 11 + b.col * 34 && b.y === 80 + b.row * 16 && b.alive && b.hp === b.maxHp &&
      b.points === ({ 1: 10, 2: 30, 3: 60 })[b.maxHp]), bs.length);
    check(`wave ${nw}: hp-2 present${nw >= 3 ? ', hp-3 present' : ', no hp-3'}`, maxHps.has(2) && (nw >= 3 ? maxHps.has(3) : !maxHps.has(3)), [...maxHps]);
    check(`wave ${nw}: combo/multiplier reset`, r2.st.combo === 0 && r2.st.multiplier === 1);
  }
  // ball speed per wave after launch: wave 5 -> 300 + 25*4 = 400
  const sp = await H(page, () => { const T = window.__shatterline; T.press('launch'); T.step(); return T.state.ball.speed; });
  check('wave 5 launch speed = 400 u/s (§10 waveParams)', Math.abs(sp - 400) < 1e-9, sp);

  // Reload: stored high score loads into state
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__shatterline);
  const hs = await H(page, () => window.__shatterline.state.highScore);
  check(`reload: highScore loaded from storage (${expected})`, hs === expected, hs);
  await page.screenshot({ path: path.join(SHOT_DIR, 'portrait-title.png') });
  checkLog(log, 'core flow');
  await ctx.close();
}

// Genuine simulated play: paddle tracks the ball; verify every brick/score event against §7.
async function testGenuinePlay(browser, base) {
  begin('genuine play (§7, §8) — paddle tracks ball, stored high = 150');
  const { ctx, page, log } = await openPage(browser, base, 'portrait', { preHigh: 150 });
  const out = await H(page, ({ key, maxSteps }) => {
    const T = window.__shatterline, S = T.state;
    T.stop();
    const log = [], lsAtBeat = [], vyViol = [], outside = [];
    let k = 0;
    T.press('launch'); T.step(); // title -> serve
    while (k < maxSteps && S.wave < 3 && S.phase !== 'gameOver') {
      if (S.phase === 'serve') T.press('launch');
      // aim with a slowly varying offset so bounce angles vary
      const off = (((k / 700) | 0) % 5 - 2) * 0.3 * (S.paddle.w / 2);
      T.setPaddleX(S.ball.x - off);
      const before = S.score;
      T.step();
      k++;
      for (const e of T.events) log.push({ ...e, k, lives: S.lives, wave: S.wave });
      if (S.score > 150 && before <= 150) lsAtBeat.push({ k, score: S.score, ls: localStorage.getItem(key) });
      if (S.phase === 'playing') {
        const b = S.ball;
        if (Math.abs(b.vy) < b.speed * 0.35 - 1e-6) vyViol.push({ k, vx: b.vx, vy: b.vy, speed: b.speed });
        if (b.x < b.r - 1e-6 || b.x > 360 - b.r + 1e-6 || b.y < 48 + b.r - 1e-6) outside.push({ k, x: b.x, y: b.y });
      }
    }
    return { steps: k, log, lsAtBeat, vyViol: vyViol.slice(0, 5), outside: outside.slice(0, 5), st: JSON.parse(JSON.stringify(S)),
      ls: localStorage.getItem(key) };
  }, { key: KEY, maxSteps: 60000 });

  const bricks = out.log.filter((e) => e.type === 'brick');
  const paddles = out.log.filter((e) => e.type === 'paddle');
  const waveClears = out.log.filter((e) => e.type === 'waveClear');
  console.log(`  info: ${out.steps} steps (${(out.steps / 120).toFixed(1)} s sim), ${bricks.length} brick hits, ` +
    `${paddles.length} paddle hits, ${waveClears.length} wave clears, final wave ${out.st.wave}, score ${out.st.score}, ` +
    `max multiplier ${Math.max(0, ...bricks.map((b) => b.multiplier))}`);
  check('genuine play reached wave 3 within 60000 steps', out.st.wave >= 3, { wave: out.st.wave, phase: out.st.phase });
  check('ball never lost while paddle tracks it', !out.log.some((e) => e.type === 'lifeLost'), out.log.filter((e) => e.type === 'lifeLost'));

  // Replay events with an independent model of §7.
  let combo = 0, score = 0, lives = 3, bad = [];
  const P = { 1: 10, 2: 30, 3: 60 };
  for (const e of out.log) {
    if (e.type === 'paddle' || e.type === 'waveStart' || e.type === 'lifeLost') combo = 0;
    if (e.type === 'lifeLost') lives = e.lives;
    if (e.type === 'brick') {
      combo++;
      const m = Math.min(5, Math.max(1, combo));
      const pts = e.destroyed ? P[e.maxHp] * m : 0;
      if (e.multiplier !== m || e.points !== pts || (e.destroyed && e.hp !== 0) || (!e.destroyed && e.hp <= 0)) bad.push({ e, m, pts });
      score += e.points;
    }
    if (e.type === 'waveClear') {
      const b = 200 * e.wave + 100 * lives;
      if (e.bonus !== b) bad.push({ e, expectedBonus: b });
      score += e.bonus;
    }
  }
  check('every brick event: multiplier = min(5,max(1,combo)), points = BRICK_POINTS*mult (0 if not destroyed)', bad.length === 0, bad.slice(0, 3));
  check('multiplier reached >= 2 in real play', bricks.some((b) => b.multiplier >= 2));
  check('non-destroying hits occurred (hp-2/3 bricks) and scored 0', bricks.some((b) => !b.destroyed && b.points === 0));
  check(`score equals sum(brick points) + sum(wave bonuses) (${score})`, out.st.score === score, { state: out.st.score, model: score });
  const multAfterPaddle = out.log.every((e, i, a) => e.type !== 'paddle' || !a[i + 1] || a[i + 1].type !== 'brick' || a[i + 1].multiplier === 1);
  check('multiplier resets to 1 after a paddle touch', multAfterPaddle);
  const hsEv = out.log.filter((e) => e.type === 'highScore');
  check('highScore event emitted exactly once (startHighScore 150 > 0)', hsEv.length === 1, hsEv);
  check('highScore event score > 150', hsEv[0] && hsEv[0].score > 150, hsEv[0]);
  check('localStorage written the very step the stored high was beaten', out.lsAtBeat.length === 1 && out.lsAtBeat[0].ls === String(out.lsAtBeat[0].score), out.lsAtBeat);
  check('localStorage tracks highScore during play', out.ls === String(out.st.highScore), { ls: out.ls, hi: out.st.highScore });
  check('|vy| >= 0.35*speed held while playing', out.vyViol.length === 0, out.vyViol);
  check('ball stayed inside walls/ceiling', out.outside.length === 0, out.outside);

  // Mid-play screenshot (portrait)
  await H(page, () => { const T = window.__shatterline, S = T.state; if (S.phase === 'serve') { T.press('launch'); }
    for (let i = 0; i < 400; i++) { T.setPaddleX(S.ball.x); T.step(); if (S.phase === 'serve') T.press('launch'); } });
  await page.screenshot({ path: path.join(SHOT_DIR, 'portrait-play.png') });

  // Lose all lives: move paddle away from the ball.
  const lose = await H(page, () => {
    const T = window.__shatterline, S = T.state, ev = [];
    let k = 0;
    while (S.phase !== 'gameOver' && k < 20000) {
      if (S.phase === 'serve' || S.phase === 'waveClear') T.press('launch');
      T.setPaddleX(S.ball.x < 180 ? 330 : 30);
      T.step(); k++;
      for (const e of T.events) ev.push({ ...e, combo: S.combo, phase: S.phase });
    }
    return { k, ev, st: JSON.parse(JSON.stringify(S)) };
  });
  const ll = lose.ev.filter((e) => e.type === 'lifeLost');
  check('lifeLost x3 with lives 2,1,0', ll.map((e) => e.lives).join(',') === '2,1,0', ll);
  check('combo reset on life lost', ll.every((e) => e.combo === 0));
  check('after lives 2 and 1 -> serve; after 0 -> gameOver', ll[0] && ll[0].phase === 'serve' && lose.st.phase === 'gameOver', { first: ll[0], phase: lose.st.phase });
  const go = lose.ev.find((e) => e.type === 'gameOver');
  check('gameOver event {score, highScore, isNewHigh:true}', go && go.score === lose.st.score && go.highScore === lose.st.highScore && go.isNewHigh === true, go);
  const pd = await H(page, () => document.getElementById('pause-btn').disabled);
  check('#pause-btn disabled in gameOver', pd === true);
  await page.screenshot({ path: path.join(SHOT_DIR, 'portrait-gameover-early.png') });
  const lock = await H(page, () => { const T = window.__shatterline; T.press('launch'); T.step(); return T.state.phase; });
  check('launch ignored within GAME_OVER_LOCK', lock === 'gameOver', lock);
  const restart = await H(page, () => { const T = window.__shatterline; T.step(120); T.press('launch'); T.step();
    return { phase: T.state.phase, score: T.state.score, lives: T.state.lives, start: T.state.startHighScore, hi: T.state.highScore, beaten: T.state.highScoreBeaten }; });
  check('launch after lock restarts -> serve, score 0, lives 3, startHighScore = previous high', restart.phase === 'serve' &&
    restart.score === 0 && restart.lives === 3 && restart.start === restart.hi && restart.beaten === false, restart);
  checkLog(log, 'genuine play');
  await ctx.close();
}

// Pause on tab switch / blur / pagehide; no auto-resume; tap resumes without launching.
async function testPause(browser, base) {
  begin('pause on tab switch (§5, §10 input lifecycle)');
  const { ctx, page, log } = await openPage(browser, base, 'portrait');
  await H(page, () => { const T = window.__shatterline; T.stop(); T.press('launch'); T.step(); T.press('launch'); T.step(); T.step(30); });
  const hide = await H(page, () => {
    const T = window.__shatterline, S = T.state;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    T.step();
    const r = { paused: S.paused, ev: T.events.slice(), ball: { ...S.ball }, time: S.time, phaseTime: S.phaseTime,
      btn: document.getElementById('pause-btn').getAttribute('aria-pressed'), txt: document.getElementById('pause-btn').textContent };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    T.step(240);
    r.after = { paused: S.paused, ball: { ...S.ball }, time: S.time, phaseTime: S.phaseTime, phase: S.phase };
    return r;
  });
  check('visibilitychange(hidden) -> paused', hide.paused === true);
  check('pause{paused:true} event', hide.ev.some((e) => e.type === 'pause' && e.paused === true), hide.ev);
  check('#pause-btn aria-pressed=true, text RESUME', hide.btn === 'true' && hide.txt === 'RESUME', hide);
  check('returning to tab does NOT auto-resume (240 steps later)', hide.after.paused === true);
  check('while paused: ball, time, phaseTime frozen', hide.after.ball.x === hide.ball.x && hide.after.ball.y === hide.ball.y &&
    hide.after.time === hide.time && hide.after.phaseTime === hide.phaseTime, hide);

  const resume = await H(page, () => { const T = window.__shatterline, S = T.state; T.press('launch'); T.step();
    return { paused: S.paused, phase: S.phase, ev: T.events.map((e) => e.type) }; });
  check('launch while paused resumes, does not relaunch', resume.paused === false && resume.phase === 'playing' && !resume.ev.includes('launch'), resume);

  // Live rAF loop + real window blur event
  await H(page, () => window.__shatterline.start());
  await page.waitForTimeout(200);
  await H(page, () => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(400);
  const b = await H(page, () => ({ paused: window.__shatterline.state.paused, t: window.__shatterline.state.time }));
  await page.waitForTimeout(400);
  const b2 = await H(page, () => ({ paused: window.__shatterline.state.paused, t: window.__shatterline.state.time, running: window.__shatterline.running }));
  check('window blur (live loop) -> paused and stays paused', b.paused && b2.paused && b2.running, { b, b2 });
  check('sim time frozen while paused with live loop', b.t === b2.t, { b, b2 });

  // PAUSE button tap toggles
  await page.tap('#pause-btn');
  await page.waitForTimeout(150);
  const tb = await H(page, () => ({ paused: window.__shatterline.state.paused, pressed: document.getElementById('pause-btn').getAttribute('aria-pressed') }));
  check('tap #pause-btn while paused -> resumes (aria-pressed=false)', tb.paused === false && tb.pressed === 'false', tb);
  await page.tap('#pause-btn');
  await page.waitForTimeout(150);
  const tb2 = await H(page, () => window.__shatterline.state.paused);
  check('tap #pause-btn while playing -> paused', tb2 === true);

  // pagehide
  await H(page, () => { const T = window.__shatterline; T.stop(); T.press('launch'); T.step(); });
  const ph = await H(page, () => { const T = window.__shatterline; window.dispatchEvent(new Event('pagehide')); T.step(); return T.state.paused; });
  check('pagehide -> paused', ph === true);
  // waveClear is pausable too
  const wc = await H(page, () => { const T = window.__shatterline, S = T.state; T.press('launch'); T.step();
    T.clearWave(); T.step(); const p0 = S.phase; T.press('forcePause'); T.step(); const r = { p0, paused: S.paused };
    T.step(400); r.phase = S.phase; return r; });
  check('forcePause in waveClear holds the wave-clear timer', wc.p0 === 'waveClear' && wc.paused && wc.phase === 'waveClear', wc);
  const ti = await H(page, () => {
    // forcePause ignored in gameOver/title per §5 is covered implicitly; check press('pause') toggle via hook
    const T = window.__shatterline, S = T.state; T.press('pause'); T.step(); const a = S.paused; T.press('pause'); T.step(); return [a, S.paused]; });
  check("press('pause') toggles paused", ti[0] === false && ti[1] === true, ti);
  checkLog(log, 'pause');
  await ctx.close();
}

// SOUND toggle: aria-pressed + isMuted, via tap, click and KeyM; never launches the game.
async function testSound(browser, base) {
  begin('SOUND toggle (§9, §10 audio)');
  const { ctx, page, log } = await openPage(browser, base, 'portrait');
  await H(page, () => window.__shatterline.stop());
  const st = () => H(page, () => ({ muted: window.__shatterline.audio.isMuted(), pressed: document.getElementById('sound-btn').getAttribute('aria-pressed'),
    text: document.getElementById('sound-btn').textContent, phase: window.__shatterline.state.phase }));
  await page.tap('#sound-btn');
  await H(page, () => window.__shatterline.step());
  let s = await st();
  check('tap SOUND -> isMuted false, aria-pressed=true, text SOUND: ON', !s.muted && s.pressed === 'true' && s.text === 'SOUND: ON', s);
  check('tapping SOUND does not start the game', s.phase === 'title', s.phase);
  const ac = await H(page, () => document.activeElement && document.activeElement.id);
  check('SOUND button blurred after click', ac !== 'sound-btn', ac);
  await page.click('#sound-btn');
  await H(page, () => window.__shatterline.step());
  s = await st();
  check('click SOUND again -> muted, aria-pressed=false, SOUND: OFF', s.muted && s.pressed === 'false' && s.text === 'SOUND: OFF', s);
  await page.keyboard.press('m');
  await H(page, () => window.__shatterline.step());
  s = await st();
  check('KeyM toggles sound on', !s.muted && s.pressed === 'true', s);
  await H(page, () => { window.__shatterline.press('mute'); window.__shatterline.step(); });
  s = await st();
  check("press('mute') toggles back off", s.muted && s.pressed === 'false', s);
  // play a bit unmuted to exercise audio voices for errors
  await page.tap('#sound-btn');
  await H(page, () => { const T = window.__shatterline, S = T.state; T.step(); T.press('launch'); T.step(); T.press('launch'); T.step();
    for (let i = 0; i < 1500; i++) { T.setPaddleX(S.ball.x); T.step(); } });
  checkLog(log, 'sound');
  await ctx.close();
}

// Layout per orientation + touch tap/drag.
async function testViewport(browser, base, kind) {
  begin(`viewport ${kind} ${VIEWPORTS[kind].viewport.width}x${VIEWPORTS[kind].viewport.height} (isMobile, hasTouch)`);
  const { ctx, page, log } = await openPage(browser, base, kind);
  const L = await H(page, () => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const c = document.getElementById('game');
    return {
      vw: innerWidth, vh: innerHeight,
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
      bsw: document.body.scrollWidth, bsh: document.body.scrollHeight,
      canvas: r(c), client: { w: c.clientWidth, h: c.clientHeight }, backing: { w: c.width, h: c.height }, dpr: devicePixelRatio,
      stage: r(document.getElementById('stage')), toolbar: r(document.getElementById('toolbar')),
      buttons: ['pause-btn', 'sound-btn'].map((id) => ({ id, ...r(document.getElementById(id)) })),
      vis: getComputedStyle(c).visibility, disp: getComputedStyle(c).display,
      touchAction: getComputedStyle(document.getElementById('stage')).touchAction,
    };
  });
  check('canvas visible and non-trivial', L.vis === 'visible' && L.disp === 'block' && L.canvas.w > 200 && L.canvas.h > 200, L.canvas);
  check('canvas within viewport', L.canvas.l >= 0 && L.canvas.t >= 0 && L.canvas.r <= L.vw + 0.5 && L.canvas.b <= L.vh + 0.5, { c: L.canvas, vw: L.vw, vh: L.vh });
  check('canvas fills #stage', Math.abs(L.canvas.w - L.stage.w) < 1 && Math.abs(L.canvas.h - L.stage.h) < 1, { c: L.canvas, s: L.stage });
  // §10 resize() reads canvas.clientWidth/Height (integers), so compare against those.
  check('backing store = round(clientW/H * dpr) (§2, §10 resize)', L.backing.w === Math.round(L.client.w * Math.min(L.dpr, 3)) && L.backing.h === Math.round(L.client.h * Math.min(L.dpr, 3)), { b: L.backing, cl: L.client, dpr: L.dpr });
  if (Math.abs(L.client.w - L.canvas.w) > 0.01 || Math.abs(L.client.h - L.canvas.h) > 0.01) {
    console.log(`  note: canvas CSS box is fractional (${L.canvas.w}x${L.canvas.h}); clientWidth rounds to ${L.client.w}x${L.client.h}`);
  }
  check('no page scroll (scrollWidth/Height <= viewport)', L.sw <= L.vw && L.sh <= L.vh && L.bsw <= L.vw && L.bsh <= L.vh, { sw: L.sw, sh: L.sh, vw: L.vw, vh: L.vh });
  for (const b of L.buttons) {
    check(`#${b.id} >= 44x44 and inside viewport`, b.w >= 44 && b.h >= 44 && b.l >= 0 && b.t >= 0 && b.r <= L.vw && b.b <= L.vh, b);
  }
  if (kind === 'landscape') {
    check('landscape: toolbar is a column at the right of the stage', L.toolbar.l >= L.stage.r - 1 && L.buttons[1].t >= L.buttons[0].b - 1, { tb: L.toolbar, st: L.stage });
    const scale = Math.min(L.canvas.w / 360, L.canvas.h / 640);
    check('landscape: portrait field letterboxed (field height == stage height)', Math.abs(640 * scale - L.canvas.h) < 1, scale);
  } else {
    check('portrait: toolbar row above the stage', L.toolbar.b <= L.stage.t + 1 && Math.abs(L.buttons[0].t - L.buttons[1].t) < 1, { tb: L.toolbar, st: L.stage });
  }
  // Scrolling attempts don't move the page
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(100);
  const sc = await H(page, () => [scrollX, scrollY, document.documentElement.scrollTop]);
  check('page cannot be scrolled', sc.every((v) => v === 0), sc);

  // Touch tap on the stage -> launch (title -> serve)
  await H(page, () => window.__shatterline.stop());
  const cx = L.canvas.l + L.canvas.w / 2, cy = L.canvas.t + L.canvas.h * 0.6;
  await page.touchscreen.tap(cx, cy);
  await H(page, () => window.__shatterline.step());
  let ph = await H(page, () => window.__shatterline.state.phase);
  check('touch tap on stage -> title to serve', ph === 'serve', ph);

  // Touch drag (relative) moves the paddle by dx/scale*1.2 (gain), CDP touch events
  const cdp = await ctx.newCDPSession(page);
  const scale = Math.min(L.canvas.w / 360, L.canvas.h / 640);
  const x0 = await H(page, () => window.__shatterline.state.paddle.x);
  const dxCss = -60;
  const sx = cx, sy = L.canvas.t + L.canvas.h * 0.8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + dxCss * i / 6, y: sy }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await H(page, () => window.__shatterline.step());
  const s1 = await H(page, () => ({ x: window.__shatterline.state.paddle.x, phase: window.__shatterline.state.phase, bx: window.__shatterline.state.ball.x }));
  const expectDx = dxCss / scale * 1.2;
  check(`touch drag ${dxCss}px moves paddle ~${expectDx.toFixed(1)}u (relative, gain 1.2)`, Math.abs((s1.x - x0) - expectDx) < 1.5, { x0, x1: s1.x, expectDx });
  check('drag is not a tap (still serve), stuck ball follows paddle', s1.phase === 'serve' && Math.abs(s1.bx - s1.x) < 1e-9, s1);
  // Drag that starts on the letterbox area still counts (landscape has side bars)
  if (kind === 'landscape') {
    const fieldL = L.canvas.l + (L.canvas.w - 360 * scale) / 2;
    const lbx = (L.canvas.l + fieldL) / 2;
    const x2 = s1.x;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: lbx, y: sy }] });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: lbx + 10 * i, y: sy }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await H(page, () => window.__shatterline.step());
    const x3 = await H(page, () => window.__shatterline.state.paddle.x);
    check('drag starting on the letterbox moves paddle', Math.abs((x3 - x2) - 40 / scale * 1.2) < 1.5, { x2, x3 });
  }
  await page.touchscreen.tap(cx, cy);
  await H(page, () => window.__shatterline.step());
  ph = await H(page, () => window.__shatterline.state.phase);
  check('touch tap -> launch (serve to playing)', ph === 'playing', ph);
  // Play a bit and screenshot
  await H(page, () => { const T = window.__shatterline, S = T.state;
    for (let i = 0; i < 900; i++) { T.setPaddleX(S.ball.x + 6); T.step(); if (S.phase === 'serve') T.press('launch'); } });
  await page.screenshot({ path: path.join(SHOT_DIR, `${kind}-play.png`) });
  await H(page, () => { window.__shatterline.press('forcePause'); window.__shatterline.step(); });
  await page.screenshot({ path: path.join(SHOT_DIR, `${kind}-paused.png`) });
  checkLog(log, kind);
  await ctx.close();
}

// Desktop mouse: absolute pointerX; click launches.
async function testMouse(browser, base) {
  begin('desktop mouse + keyboard');
  const { ctx, page, log } = await openPage(browser, base, 'desktop');
  await H(page, () => window.__shatterline.stop());
  const c = await H(page, () => { const b = document.getElementById('game').getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
  const scale = Math.min(c.w / 360, c.h / 640), offX = (c.w - 360 * scale) / 2;
  await page.mouse.click(c.l + c.w / 2, c.t + c.h / 2);
  await H(page, () => window.__shatterline.step());
  const ph = await H(page, () => window.__shatterline.state.phase);
  check('mouse click on stage -> start (serve)', ph === 'serve', ph);
  const targetU = 100;
  await page.mouse.move(c.l + offX + targetU * scale, c.t + c.h / 2);
  await H(page, () => window.__shatterline.step());
  const px = await H(page, () => window.__shatterline.state.paddle.x);
  check('mouse move -> paddle.x = toLogical x (absolute)', Math.abs(px - targetU) < 0.6, px);
  await page.keyboard.down('ArrowRight');
  await H(page, () => window.__shatterline.step(60));
  await page.keyboard.up('ArrowRight');
  const px2 = await H(page, () => window.__shatterline.state.paddle.x);
  check('ArrowRight held 0.5 s -> paddle +240u (480 u/s), clamped', Math.abs(px2 - Math.min(100 + 240, 360 - 36)) < 1, px2);
  await page.keyboard.press('Space');
  await H(page, () => window.__shatterline.step());
  const ph2 = await H(page, () => window.__shatterline.state.phase);
  check('Space -> launch (playing)', ph2 === 'playing', ph2);
  await page.keyboard.press('p');
  await H(page, () => window.__shatterline.step());
  check('KeyP -> paused', await H(page, () => window.__shatterline.state.paused) === true);
  checkLog(log, 'desktop');
  await ctx.close();
}

main().catch((e) => { console.error('SMOKE CRASHED:', e); process.exit(2); });
