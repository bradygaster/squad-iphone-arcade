// Records docs/media frames: node tests/capture-gif.cjs <outDir> [url] (serve repo first)
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('process.argv[3] || "http://localhost:8000/"'); await p.waitForTimeout(400);
  await p.evaluate(() => { localStorage.setItem('shatterline.highscore.v1','1200'); });
  await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(() => window.__shatterline.stop());
  let f = 0; const shot = async () => p.screenshot({ path: `${out}/f${String(f++).padStart(4,'0')}.png` });
  const run = async (n, fn) => { for (let i = 0; i < n; i++) { await p.evaluate(fn, i); await shot(); } };
  await run(12, () => window.__shatterline.step(8));                       // title
  await p.evaluate(() => { const s = window.__shatterline; s.press('launch'); s.step(); });
  await run(8, (i) => { const s = window.__shatterline; s.setPaddleX(180 + i*6); s.step(8); }); // serve
  await p.evaluate(() => { const s = window.__shatterline; s.press('launch'); s.step(); });
  const play = (n, k) => run(n, (i) => { const s = window.__shatterline, st = s.state;
    const off = Math.sin(i / 7) * st.paddle.w * 0.4;
    s.setPaddleX(st.ball.stuck ? 180 : st.ball.x + off);
    if (st.ball.stuck && i % 6 === 0) s.press('launch');
    s.step(10); });
  await play(130);
  await p.evaluate(() => { const s = window.__shatterline; s.clearWave(); s.step(); });
  await run(22, () => window.__shatterline.step(8));
  await play(90);
  console.log('frames', f, 'errors', errs.length, await p.evaluate(() => JSON.stringify({w: window.__shatterline.state.wave, s: window.__shatterline.state.score, ph: window.__shatterline.state.phase})));
  await b.close();
})();
