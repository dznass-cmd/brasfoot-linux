// Optional real-browser integration test, separate from dependency-free test-*.cjs.
// Uses a new, isolated browser profile.
// BRASFOOT_PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.BRASFOOT_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.BRASFOOT_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'brasfoot-tactical-ui-'));

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BRASFOOT_TEST_BROWSER ? { executablePath: process.env.BRASFOOT_TEST_BROWSER } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1260, height: 840 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.evaluate(() => {
      app.soundEnabled = false; app.startNewGame(255); app.playRound(); app.pauseLiveMatch();
      const [home, away] = app.getLiveTeams(), state = app.currentSimMatch;
      for (let i = 0; i < 20; i++) MatchEngine.stepMatch(state, home, away, () => .8);
      app.updateLiveMatchUI();
    });
    await page.locator('#match-formation').selectOption('4-3-3');
    await page.locator('#match-style').selectOption('Ofensivo');
    await page.locator('#apply-match-tactics-btn').click();
    const applied = await page.evaluate(() => ({ minute: app.currentSimMatch.minute,
      changes: app.currentSimMatch.tacticalAnalysis.changes.length, paused: app.matchPaused }));
    assert.equal(applied.minute, 20); assert.ok(applied.changes > 0); assert.ok(applied.paused);
    assert.match(await page.locator('#match-analysis-comparison').innerText(), /Aguardando/);
    await page.evaluate(() => {
      for (let i = 0; i < 7; i++) { app.matchPaused = false; app.advanceLiveMinute(); }
      app.pauseLiveMatch();
    });
    await page.locator('[data-match-tab="analysis"]').click();
    for (const metric of ['possession', 'xG', 'shots', 'accuracy', 'energy']) {
      await page.locator('#match-analysis-metric').selectOption(metric);
      assert.ok(await page.locator('#match-analysis-chart svg').isVisible());
      assert.match(await page.locator('#match-analysis-comparison').innerText(), /períodos de 5 min/);
      assert.doesNotMatch(await page.locator('#match-analysis-chart').innerHTML(), /NaN|Infinity/);
    }
    await page.locator('#match-analysis-metric').selectOption('possession');
    const beforeReload = await page.evaluate(() => JSON.stringify(app.currentSimMatch.tacticalAnalysis));
    await page.reload(); await page.evaluate(() => { app.soundEnabled = false; app.checkSavedGame(); });
    assert.equal(await page.evaluate(() => JSON.stringify(app.currentSimMatch.tacticalAnalysis)), beforeReload);
    assert.equal(await page.evaluate(() => app.matchPaused), true);
    await page.evaluate(() => {
      const teams = app.getLiveTeams(), side = 1 - app.currentSimMatch.userSide;
      MatchEngine.changeTactics(app.currentSimMatch, ...teams, side, '5-4-1', 'Defensivo'); app.updateLiveMatchUI();
    });
    assert.equal(await page.locator('#match-analysis-chart svg g line').count(), await page.evaluate(() => app.currentSimMatch.tacticalAnalysis.changes.length));
    // The most recent explicit choice can be either coach, independent of the user side.
    const last = await page.evaluate(() => String(app.currentSimMatch.tacticalAnalysis.changes.length - 1));
    await page.locator('#match-analysis-change').selectOption(last);
    assert.match(await page.locator('#match-analysis-plan').innerText(), /5-4-1/);
    await page.locator('#match-analysis-change').selectOption('latest');
    for (const [width, height] of [[1260, 840], [1024, 768], [800, 600], [460, 800]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-match-tab="analysis"]').click();
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.match-card'), chart = document.getElementById('match-analysis-chart');
        const bounds = chart.getBoundingClientRect();
        return { scrollWidth: card.scrollWidth, clientWidth: card.clientWidth,
          chartWidth: bounds.width, chartRight: bounds.right, viewport: window.innerWidth };
      });
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `Horizontal overflow at ${width}px: ${JSON.stringify(layout)}`);
      assert.ok(layout.chartWidth > 200 && layout.chartRight <= width, `Chart clipped at ${width}px`);
      await page.screenshot({ path: path.join(output, `analysis-${width}.png`) });
    }
    await page.setViewportSize({ width: 1260, height: 840 });
    await page.locator('[data-match-tab="all"]').click();
    assert.ok(await page.locator('#match-analysis-chart').isVisible());
    assert.ok(await page.locator('#match-live-fixtures').isVisible());
    assert.ok(await page.locator('#match-tactics-form').isVisible());
    await page.screenshot({ path: path.join(output, 'match-overview.png') });
    await page.locator('[data-match-tab="round"]').click();
    assert.ok(await page.locator('#match-live-fixtures').isVisible());
    assert.equal(await page.locator('.match-analysis').isVisible(), false);
    await page.locator('[data-match-tab="analysis"]').click();
    await page.evaluate(() => app.skipMatchSimulation());
    assert.equal(await page.evaluate(() => app.currentSimMatch.finished), true);
    assert.equal(await page.evaluate(() => app.currentSimMatch.tacticalAnalysis.samples.at(-1).minute), 90);
    assert.ok(await page.locator('#match-analysis-chart svg').isVisible());
    assert.deepEqual(errors, []);
    console.log('PASS: live tactical controls, five chart metrics, both coaches, persistence/recovery, 1260/1024/800/460px layouts, round scores and final whistle.');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
