// Flow website audit: speed, weight, fonts, tap targets, claims and copy-rule checks.
// Usage: node site-audit.cjs <url> [outDir]
// Needs Playwright with Chromium (pre-installed in Claude Code cloud sessions).
// Prints one JSON object and writes desktop and phone screenshots to outDir.

const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const outDir = process.argv[3] || '.';
if (!url) { console.error('Usage: node site-audit.cjs <url> [outDir]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const slug = new URL(url).host.replace(/^www\./, '').replace(/\W+/g, '-');

async function scrollAll(page, step) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += step) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch();
  const out = { url, testedAtUTC: new Date().toISOString() };

  // Desktop pass: weight by host, fonts, copy checks, screenshots.
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await dctx.newPage();
  const scripts = [];
  d.on('response', async r => {
    if (r.request().resourceType() !== 'script') return;
    try { const b = await r.body(); scripts.push({ host: new URL(r.url()).host, kb: b.length / 1024 }); } catch {}
  });
  await d.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await d.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await d.waitForTimeout(2500);
  out.desktopLcpMs = Math.round(await d.evaluate(() => window.__lcp));
  await d.screenshot({ path: path.join(outDir, `${slug}-desktop-fold.png`) });
  await scrollAll(d, 500);
  await d.screenshot({ path: path.join(outDir, `${slug}-desktop-full.png`), fullPage: true });

  const ownHost = new URL(url).host.replace(/^www\./, '');
  const byHost = {};
  for (const s of scripts) {
    const k = s.host.includes(ownHost) ? 'own' : s.host;
    byHost[k] = byHost[k] || { files: 0, kb: 0 };
    byHost[k].files++; byHost[k].kb += s.kb;
  }
  for (const k in byHost) byHost[k].kb = Math.round(byHost[k].kb);
  out.javascriptUncompressedKB = { total: Math.round(scripts.reduce((a, s) => a + s.kb, 0)), byHost };

  out.copy = await d.evaluate(() => {
    const t = document.body.innerText;
    const n = re => (t.match(re) || []).length;
    const ctx = re => [...t.matchAll(re)].slice(0, 6).map(m => t.slice(Math.max(0, m.index - 40), m.index + 50).replace(/\s*\n\s*/g, ' | '));
    return {
      claims: {
        topN: ctx(/Top \d+/g),
        dollarVolume: ctx(/\$\d[\d.,]*\s?[MBK]\+?\s*(Mortgages|Funded|in mortgages)?/g),
        fundedOrFinanced: ctx(/[Ff]unded|[Ff]inanced/g),
        familiesCount: ctx(/\d[\d,]*\+?\s*(Canadian\s+)?[Ff]amilies/g),
        ratingMentions: n(/4\.9/g),
        reviewCountMentions: n(/\d+\+\s*(five-star|5-Star|Google)?\s*[Rr]eviews/g),
        approvedCmpLine: n(/CMP Top 75/g),
      },
      emojis: ctx(/(?![©®™])\p{Extended_Pictographic}/gu),
      emDashes: ctx(/—/g),
      fontsLoaded: [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/"/g, '')))],
    };
  });
  await dctx.close();

  // Phone pass: Lighthouse mobile throttling, LCP, tap targets, page length.
  const mctx = await browser.newContext({ ...devices['Pixel 7'] });
  const m = await mctx.newPage();
  const cdp = await mctx.newCDPSession(m);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await m.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await m.goto(url, { waitUntil: 'load', timeout: 180000 });
  await m.waitForTimeout(4000);
  const phone = await m.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const small = [...document.querySelectorAll('a,button,[role=button]')].filter(e => {
      const b = e.getBoundingClientRect();
      return b.width > 0 && (b.width < 44 || b.height < 44) && getComputedStyle(e).visibility !== 'hidden';
    }).map(e => (e.innerText.trim() || e.getAttribute('aria-label') || e.tagName).replace(/\s+/g, ' ').slice(0, 30));
    return { fcpMs: Math.round(fcp ? fcp.startTime : 0), lcpMs: Math.round(window.__lcp), tapTargetsUnder44px: small.length, tapTargetSample: small.slice(0, 12) };
  });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await m.screenshot({ path: path.join(outDir, `${slug}-phone-fold.png`) });
  await scrollAll(m, 300);
  phone.pageHeightPx = await m.evaluate(() => document.body.scrollHeight);
  phone.horizontalScroll = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await m.screenshot({ path: path.join(outDir, `${slug}-phone-full.png`), fullPage: true });
  out.phoneSlow4G = phone;
  await mctx.close();

  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
