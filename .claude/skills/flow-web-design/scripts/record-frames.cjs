const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const FPS = 30, DT = 1000 / FPS;
(async () => {
  const which = process.argv[2];
  const b = await chromium.launch();
  const cfg = which === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
  const ctx = await b.newContext(cfg); const p = await ctx.newPage();
  await p.clock.install({ time: 0 });
  await p.goto('file://' + path.resolve('' + (process.argv[3] || 'lift/index.html') + ''), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const dir = process.argv[4] || `fr-${which}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let n = 0;
  const shot = async () => {
    await p.clock.runFor(DT);
    await p.evaluate(dt => { for (const a of document.getAnimations()) { if (a.__v === undefined) { a.__v = a.currentTime || 0; a.pause(); } a.__v += dt; a.currentTime = a.__v; } }, DT);
    await p.screenshot({ path: `${dir}/f${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
  };
  const hold = async s => { for (let i = 0; i < s * FPS; i++) await shot(); };
  const scrollTo = async (y, s) => {
    const from = await p.evaluate(() => scrollY); const N = Math.round(s * FPS);
    for (let i = 1; i <= N; i++) { const k = i / N; const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), from + (y - from) * e); await shot(); }
  };
  const topOf = id => p.evaluate(id => document.getElementById(id).getBoundingClientRect().top + scrollY, id);
  await hold(0.5);
  if (which !== 'phone') { for (let i = 0; i < 40; i++) { await p.mouse.move(160 + i * 22, 712 + Math.sin(i / 4) * 10); await shot(); } }
  await hold(1.8);
  await p.evaluate(() => document.getElementById('hear').click()); await hold(2.0);
  await p.evaluate(() => document.getElementById('close').click()); await hold(0.6);
  const off = which === 'phone' ? -40 : -45;
  for (const id of ['payment', 'term', 'equity', 'tax', 'rate']) { await scrollTo(await topOf(id) + off, 1.4); await hold(1.5); }
  await scrollTo(await topOf('plan'), 1.6); await hold(2.4);
  const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await scrollTo(H, 1.4); await hold(1.0);
  console.log(which, 'frames', n);
  await b.close();
})();
