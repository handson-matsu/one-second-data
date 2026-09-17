// Run with Playwright available through NODE_PATH and CHROME_PATH if needed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}) });
 try {
 const page = await browser.newPage(); const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
 for (const [target, count, feedback] of [[1,10,'on'],[1,100,'on'],[3,10,'on'],[1,10,'off'],[3,10,'off']]) {
  await page.goto(url);
  await page.evaluate(() => {window.testNow=123.25; Object.defineProperty(performance,'now',{value:()=>window.testNow, configurable:true});});
  await page.locator(`input[name=target][value="${target}"]`).check();
  await page.locator(`input[name=count][value="${count}"]`).check();
  await page.locator(`input[name=feedback][value="${feedback}"]`).check();
  await page.locator('.start').click();
  assert.equal(await page.locator('#completed').textContent(),'0');
  assert.equal(await page.locator('#feedback-area').isVisible(),feedback==='on');
  assert.equal(await page.locator('#tap > span').textContent(),'START');
  // Waiting on the measurement screen must not enter the first interval.
  await page.evaluate(() => window.testNow += 45000);
  assert.deepEqual(await page.evaluate(() => ({ active: session.active, values: session.values })), { active: false, values: [] });
  const box = await page.locator('#tap').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  assert.equal(await page.locator('#tap > span').textContent(),'STOP');
  assert.equal(await page.locator('#completed').textContent(),'0');
  assert.equal(await page.evaluate(() => session.previous),45123.25);
  // Start is recorded at press, not release; release must not record a STOP.
  await page.evaluate(() => window.testNow += 125);
  await page.mouse.up();
  assert.equal(await page.locator('#completed').textContent(),'0');
  const expected=[];
  for(let i=0;i<count;i++) {
   const interval=target*1000+(i%5-2)*21.25; expected.push(interval);
   await page.evaluate(ms=>window.testNow+=ms,interval - (i === 0 ? 125 : 0));
   await page.locator('#tap').click();
   assert.equal(await page.locator('#completed').textContent(),String(i+1));
   if(i<count-1) assert.equal(await page.locator('#results').isVisible(),false);
  }
  assert.equal(await page.locator('#results').isVisible(),true);
  assert.equal(await page.evaluate(() => session.active),false);
  await page.evaluate(() => { window.testNow += 1000; record(); });
  assert.equal(await page.evaluate(() => session.values.length),count);
  const plotted = await page.locator('#sequence circle').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.value)));
  assert.deepEqual(plotted,expected);
  assert.equal(await page.locator('#data-list li').count(),count);
  const bars=await page.locator('#histogram rect').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.count)));
  const table=await page.locator('#frequency-body td').allTextContents();
  assert.deepEqual(bars,table.map(Number)); assert.equal(bars.reduce((a,b)=>a+b,0),count);
  const mean=expected.reduce((a,b)=>a+b,0)/count;
  const variance=expected.reduce((s,x)=>s+(x-mean)**2,0)/count;
  const cardValues=await page.locator('.stat-value').allTextContents();
  assert.equal(cardValues[1],(mean/1000).toFixed(2)+'秒');
  assert.equal(cardValues[3],(variance/1e6).toFixed(4)+'秒²');
  console.log(`PASS ${target}s / ${count} taps / feedback ${feedback}: intervals, exact count, statistics, graph order, histogram/table`);
 }
 for(const [width,height] of [[390,844],[768,1024],[1440,1000]]) {
  await page.setViewportSize({width,height});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/private/tmp/one-second-result-${width}.png`,fullPage:true});
  await page.goto(url);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/private/tmp/one-second-setup-${width}.png`,fullPage:true});
  await page.locator('.start').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/private/tmp/one-second-measure-${width}.png`,fullPage:true});
  await page.locator('#tap').press('Space');
  assert.equal(await page.locator('#completed').textContent(),'0');
  assert.equal(await page.locator('#tap > span').textContent(),'STOP');
  await page.locator('#tap').press('Space');
  assert.equal(await page.locator('#completed').textContent(),'1');
  await page.locator('#reset').click(); assert.equal(await page.locator('#setup').isVisible(),true);
  console.log(`PASS ${width}x${height}: no horizontal overflow, keyboard input, reset`);
  // Complete another run so next viewport also inspects populated results.
  await page.locator('input[name=count][value="10"]').check();
  await page.locator('.start').click();
  await page.locator('#tap').click();
  for(let i=0;i<10;i++) await page.locator('#tap').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS no browser errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
