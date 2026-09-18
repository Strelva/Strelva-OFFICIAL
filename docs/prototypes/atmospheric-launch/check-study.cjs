/* Local study checks: start the README server, then pass its URL if needed. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.argv[2] || 'http://127.0.0.1:4332/prototypes/atmospheric-launch/';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.materialDiagnostics?.().some(scene => scene.frames > 1));
  const report = [];
  async function check(name, run) { await run(); report.push(name); }
  await check('Skip link and keyboard dialog focus restoration', async () => {
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').textContent(), 'Skip to content');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'content');
    const inspect = page.locator('[data-detail="0"]');
    await inspect.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog').evaluate(el => el.open), true);
    assert.equal(await page.locator(':focus').getAttribute('id'), 'close');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator(':focus').getAttribute('data-detail'), '0');
  });
  await check('Shareable theme, blur and selected material with accurate recipe', async () => {
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.locator('#blur').fill('40');
    await page.locator('[data-detail="1"]').click();
    const shared = new URL(page.url());
    assert.equal(shared.searchParams.get('theme'), 'light');
    assert.equal(shared.searchParams.get('blur'), '40');
    assert.equal(shared.searchParams.get('material'), 'banks');
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.match(await page.locator('#recipe-blur').textContent(), /^40 px/);
    assert.equal(await page.locator('#detail-title').textContent(), 'Cloud banks');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#f2f3ef');
    assert.equal(await page.locator('dialog').evaluate(el => getComputedStyle(el).overscrollBehavior), 'contain');
    await page.keyboard.press('Escape');
  });
  await check('Both themes and responsive geometry at 320, 360, 768, 1280 and 1600px', async () => {
    for (const theme of ['dark', 'light']) {
      await page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
      for (const width of [320,360,768,1280,1600]) {
        await page.setViewportSize({ width, height: 1000 });
        const result = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          bad: [...document.querySelectorAll('.card')].filter(el => {
            const style = getComputedStyle(el);
            return style.padding !== '24px' || style.borderRadius !== '24px';
          }).length,
          clipped: [...document.querySelectorAll('.glass')].some(el => {
            const a = el.getBoundingClientRect(), b = el.closest('.card').getBoundingClientRect();
            return a.bottom > b.bottom || a.right > b.right;
          })
        }));
        assert.deepEqual(result, { overflow:false, bad:0, clipped:false }, `${theme} ${width}px`);
      }
    }
  });
  await check('Long strings, doubled text and narrow dialog remain contained', async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      document.querySelector('.glass > p').textContent = 'VeryLongUnbrokenProjectContextIdentifier'.repeat(8);
      const style = document.createElement('style');
      style.textContent = '.glass > p,.glass p,.glass h2,.card-head,.card-bottom{font-size:24px!important;line-height:1.5!important}';
      document.head.append(style);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.glass > p').first().evaluate(el => el.scrollWidth > el.clientWidth), false);
    await page.locator('[data-detail="0"]').click();
    await page.locator('#detail-copy').evaluate(el => el.textContent = 'Material details. '.repeat(200));
    assert.equal(await page.locator('dialog').evaluate(el => el.clientHeight < el.scrollHeight && el.getBoundingClientRect().bottom <= innerHeight - 23), true);
    await page.keyboard.press('Escape');
    await page.goto(url);
  });
  await check('Visible Inspect hover and actual adjustable backdrop filter', async () => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const button = page.locator('[data-detail="0"]');
    await button.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(160);
    const before = await button.evaluate(el => getComputedStyle(el).backgroundColor);
    await page.evaluate(() => document.fonts.ready);
    await button.hover();
    await page.waitForTimeout(250);
    await button.hover();
    await page.waitForFunction(() => document.querySelector('[data-detail="0"]:hover'));
    await page.waitForTimeout(160);
    assert.notEqual(await button.evaluate(el => getComputedStyle(el).backgroundColor), before);
    await page.locator('#blur').fill('0');
    assert.match(await page.locator('.card').first().evaluate(el => getComputedStyle(el, '::before').backdropFilter), /blur\(0px\)/);
    await page.locator('#glass-toggle').click();
    assert.equal(await page.locator('.card').first().evaluate(el => getComputedStyle(el, '::before').visibility), 'hidden');
    await page.locator('#glass-toggle').click();
    await page.locator('#blur').fill('24');
  });
  await check('Paused frames, offscreen suspension and cached dimensions', async () => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('#motion').click();
    await page.waitForTimeout(80);
    const frames = await page.evaluate(() => materialDiagnostics().map(s => s.frames));
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => materialDiagnostics().map(s => s.frames)), frames);
    assert.equal(await page.evaluate(() => materialDiagnostics().filter(s => !s.visible).length > 0), true);
    await page.evaluate(() => {
      window.layoutReads = 0;
      const original = HTMLCanvasElement.prototype.getBoundingClientRect;
      HTMLCanvasElement.prototype.getBoundingClientRect = function (...args) { window.layoutReads++; return original.apply(this,args); };
    });
    await page.locator('#motion').click();
    await page.waitForTimeout(240);
    assert.equal(await page.evaluate(() => window.layoutReads), 0);
    assert.equal(await page.evaluate(() => materialDiagnostics().every(s => s.width <= 640 && s.height <= 640 && s.error === 0)), true);
  });
  await check('Persisted page lifecycle resumes live renderer', async () => {
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    const frames = await page.evaluate(() => materialDiagnostics().map(s => s.frames));
    await page.waitForTimeout(160);
    assert.deepEqual(await page.evaluate(() => materialDiagnostics().map(s => s.frames)), frames);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(old => materialDiagnostics().some((s,i) => s.frames > old[i] && s.error === 0), frames), true);
  });
  await check('Reduced motion stays static and prevents manual override', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#motion').disabled);
    assert.equal(await page.locator('#motion').isDisabled(), true);
    assert.equal(await page.locator('.aceternity-layer i').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    const frames = await page.evaluate(() => materialDiagnostics().map(s => s.frames));
    await page.waitForTimeout(160);
    assert.deepEqual(await page.evaluate(() => materialDiagnostics().map(s => s.frames)), frames);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('No-WebGL fallback retains controls and material', async () => {
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type,...args) { return type === 'webgl' ? null : original.call(this,type,...args); };
    });
    await fallback.goto(url);
    assert.equal(await fallback.locator('[data-renderer="fallback"]').count(), 6);
    await fallback.locator('[data-detail="0"]').click();
    assert.equal(await fallback.locator('dialog').evaluate(el => el.open), true);
    assert.notEqual(await fallback.locator('.fallback-material').first().evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    await fallback.close();
  });
  await page.locator('#motion').click();
  const artifactDir = path.join(process.cwd(), 'output', 'atmospheric-study');
  fs.mkdirSync(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, 'dark-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Light', exact:true }).click();
  await page.setViewportSize({ width:360,height:1000 });
  await page.screenshot({ path:path.join(artifactDir,'light-mobile.png'),fullPage:true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed:report, screenshots:artifactDir, pageErrors:errors },null,2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
