// Smoke test for the player sheets: loads each file at phone width, clicks every tab,
// opens the first skill modal, and reports horizontal overflow and script errors.
// Setup: npm i -D playwright && npx playwright install chromium
// Usage: node tools/sheet_smoke.js sheets/*.html
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for (const f of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 400, height: 900 } }); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + path.resolve(f));
    const tabs = await p.$$eval('nav.tabs button', bs => bs.map(x => x.textContent));
    for (const t of tabs) {
      await p.click(`nav.tabs button:has-text("${t}")`);
      const w = await p.evaluate(() => document.documentElement.scrollWidth);
      if (w > 400) errs.push(`tab ${t}: page is ${w}px wide`);
      if (t === 'Skills') { await p.click('#panel .sk .n >> nth=0'); await p.keyboard.press('Escape'); }
    }
    console.log(path.basename(f), tabs.join(' / '), errs.length ? errs : 'ok'); bad += errs.length;
  }
  await b.close(); process.exit(bad ? 1 : 0);
})();
