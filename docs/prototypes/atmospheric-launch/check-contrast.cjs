/* Sample rendered backgrounds beneath text, with glyphs temporarily hidden.
 * This checks paused compositions, not every possible animation frame. */
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.argv[2] || 'http://127.0.0.1:4332/prototypes/atmospheric-launch/';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width:1280, height:1000 } });
  await page.goto(url);
  await page.waitForFunction(() => window.materialDiagnostics?.().some(scene => scene.frames > 1));
  await page.locator('#motion').click();
  const samples = [];
  const selector = '.tag,h2,.glass>p,.status,.card-bottom button';
  for (const theme of ['dark','light']) {
    await page.getByRole('button', { name:theme === 'dark' ? 'Dark' : 'Light', exact:true }).click();
    for (const blur of ['0','24','40']) {
      await page.locator('#blur').fill(blur);
      for (let index = 0; index < 6; index++) {
        const card = page.locator('.card').nth(index);
        await card.scrollIntoViewIfNeeded();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const elements = await card.evaluate((card, selector) => [...card.querySelectorAll(selector)].map(el => {
          const r = el.getBoundingClientRect();
          return { selector:el.tagName + '.' + el.className, color:getComputedStyle(el).color, rect:{ x:r.x,y:r.y,width:r.width,height:r.height } };
        }), selector);
        const hidden = await page.addStyleTag({ content:'.card .tag,.card h2,.card .glass>p,.card .status,.card .status *,.card .card-bottom button,.card .card-bottom button *{color:transparent!important;transition:none!important}' });
        const image = (await page.screenshot()).toString('base64');
        await hidden.evaluate(el => el.remove());
        const measured = await page.evaluate(async ({ elements,image }) => {
          const source = new Image(); source.src = `data:image/png;base64,${image}`;
          await source.decode();
          const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(source,0,0);
          const { data } = ctx.getImageData(0,0,canvas.width,canvas.height);
          const linear = x => (x /= 255) <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
          const luminance = a => a.map(linear).reduce((v,x,i) => v + x * [.2126,.7152,.0722][i],0);
          return elements.map(item => {
            const foreground = luminance(item.color.match(/[\d.]+/g).slice(0,3).map(Number));
            let minimum = Infinity;
            for (let y = Math.ceil(item.rect.y + 4); y < Math.min(canvas.height,item.rect.y + item.rect.height - 4); y += 4) {
              for (let x = Math.ceil(item.rect.x + 8); x < Math.min(canvas.width,item.rect.x + item.rect.width - 8); x += 4) {
                const offset = (y * canvas.width + x) * 4;
                const background = luminance([data[offset],data[offset+1],data[offset+2]]);
                minimum = Math.min(minimum,(Math.max(foreground,background) + .05) / (Math.min(foreground,background) + .05));
              }
            }
            return { selector:item.selector,ratio:minimum };
          }).filter(item => Number.isFinite(item.ratio));
        }, { elements,image });
        if (measured.some(item => item.ratio < 4.5)) {
          fs.mkdirSync('output/atmospheric-study', { recursive:true });
          fs.writeFileSync(`output/atmospheric-study/contrast-failure-${theme}-${blur}-${index}.png`, Buffer.from(image,'base64'));
          console.log({ theme,blur,index,elements,measured });
        }
        samples.push(...measured.map(item => ({ theme,blur,index,...item })));
      }
    }
  }
  const artifactDir = path.join(process.cwd(),'output','atmospheric-study');
  fs.mkdirSync(artifactDir,{ recursive:true });
  fs.writeFileSync(path.join(artifactDir,'contrast-samples.json'),JSON.stringify(samples,null,2));
  const failures = samples.filter(item => item.ratio < 4.5);
  console.log(JSON.stringify({ boxes:samples.length,minimum:Math.min(...samples.map(x => x.ratio)),failures },null,2));
  await browser.close();
  assert.deepEqual(failures,[]);
})().catch(error => { console.error(error); process.exit(1); });
