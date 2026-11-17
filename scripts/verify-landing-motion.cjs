/* Scene motion: node scripts/verify-landing-motion.cjs <url> [playwright module path] [artifacts directory] */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[3] || 'playwright');
const url = process.argv[2] || 'http://localhost:8769/landing.html';
const artifacts = process.argv[4];
(async () => {
  const browser = await chromium.launch({channel:'chrome'});
  const failures = [];
  let checks = 0;
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const verify = async (name, run) => {
      try { await run(); checks++; console.log('PASS ' + name); }
      catch (error) { failures.push(name + ': ' + error.message); console.log('FAIL ' + failures.at(-1)); }
    };
    const settled = () => page.waitForFunction(() => !document.body.dataset.sceneTransition);
    const visit = async id => { await page.goto(url + '#' + id); await settled(); };
    const sample = () => page.evaluate(() => {
      const y = id => new DOMMatrix(getComputedStyle(document.getElementById(id)).transform).m42;
      const main = document.querySelector('main').getBoundingClientRect();
      return {about:y('about'),structure:y('structure'),height:main.height,scene:document.body.dataset.scene,header:document.querySelector('header').getBoundingClientRect().top};
    });
    const capture = async name => {
      if (!artifacts) return;
      fs.mkdirSync(artifacts,{recursive:true});
      await page.screenshot({path:path.join(artifacts,name+'.png')});
    };
    await verify('next scene slides continuously and lands without further input', async () => {
      await visit('about');
      await page.locator('#scrollCue').click();
      await page.waitForTimeout(130);
      const mid = await sample();
      assert.equal(mid.scene,'structure');
      assert.ok(mid.structure > 5 && mid.structure < mid.height, JSON.stringify(mid));
      assert.ok(mid.about < -5 && mid.about > -mid.height, JSON.stringify(mid));
      assert.ok(Math.abs(mid.structure - mid.about - mid.height) < 3, 'the two scenes stay edge-to-edge');
      assert.equal(mid.header,0);
      await capture('scene-forward-in-motion');
      await settled();
      assert.ok(Math.abs((await sample()).structure) < 1);
      assert.equal(await page.locator('#about').isVisible(),false);
      await capture('scene-forward-landed');
    });
    await verify('previous scene slides down from above and lands fully', async () => {
      await visit('structure');
      await page.locator('#previousStep').click();
      await page.waitForTimeout(130);
      const mid = await sample();
      assert.equal(mid.scene,'about');
      assert.ok(mid.about < -5 && mid.structure > 5, JSON.stringify(mid));
      await capture('scene-backward-in-motion');
      await settled();
      assert.ok(Math.abs((await sample()).about) < 1);
    });
    await verify('reversing mid-flight retraces the same motion without a position jump', async () => {
      await visit('about');
      await page.locator('#scrollCue').click();
      await page.waitForTimeout(170);
      const before = await sample();
      assert.ok(before.structure > 5 && before.structure < before.height, 'reversal must start during real movement');
      await page.locator('#previousStep').click();
      const after = await sample();
      assert.equal(after.scene,'about');
      assert.ok(Math.abs(after.about - before.about) < before.height * .3, JSON.stringify({before,after}));
      await settled();
      assert.ok(Math.abs((await sample()).about) < 1);
      assert.equal(await page.locator('#structure').isVisible(),false);
    });
    await verify('one wheel burst cannot skip another scene during or after animation', async () => {
      await visit('about'); await page.mouse.move(650,400);
      await page.mouse.wheel(0,9000);
      for (let i=0;i<14;i++) { await page.waitForTimeout(65); await page.mouse.wheel(0,50-i); }
      await settled();
      assert.equal(await page.evaluate(()=>document.body.dataset.scene+':'+document.body.dataset.step),'structure:0');
    });
    await verify('a fresh quick wheel gesture during travel runs once on arrival', async () => {
      await visit('about'); await page.mouse.move(650,400);
      await page.waitForTimeout(180);
      await page.mouse.wheel(0,100);
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(()=>!!document.body.dataset.sceneTransition),true);
      await page.mouse.wheel(0,100);
      for (let i=0;i<4;i++) { await page.waitForTimeout(40); await page.mouse.wheel(0,50-i*10); }
      await settled();
      assert.equal(await page.evaluate(()=>document.body.dataset.scene+':'+document.body.dataset.step),'structure:1');
    });
    await verify('reversing clears the queued forward gesture', async () => {
      await visit('about'); await page.mouse.move(650,400);
      await page.waitForTimeout(180);
      await page.mouse.wheel(0,100);
      await page.waitForTimeout(180);
      await page.mouse.wheel(0,100);
      await page.mouse.wheel(0,-100);
      await settled();
      assert.equal(await page.evaluate(()=>document.body.dataset.scene+':'+document.body.dataset.step),'about:0');
    });
    await verify('first hero scroll reveals arrival before the follow-up caption', async () => {
      await visit('welcome');
      const opacity = selector => page.locator(selector).evaluate(el => Number(getComputedStyle(el).opacity));
      assert.equal(await opacity('.arrived'),0);
      assert.equal(await opacity('.art-caption'),0);
      await page.mouse.move(650,400);
      await page.waitForTimeout(120);
      await page.mouse.wheel(0,100);
      await page.waitForTimeout(160);
      assert.equal(await page.evaluate(()=>document.body.dataset.step),'1');
      assert.ok(await opacity('.arrived') > .2);
      assert.equal(await opacity('.art-caption'),0);
      await page.waitForTimeout(500);
      assert.equal(await opacity('.arrived'),1);
      assert.equal(await opacity('.art-caption'),1);
      const sizes = await page.evaluate(()=>({arrival:parseFloat(getComputedStyle(document.querySelector('.arrived')).fontSize),greeting:parseFloat(getComputedStyle(document.querySelector('.greeting')).fontSize)}));
      assert.ok(sizes.arrival > sizes.greeting);
      await page.mouse.wheel(0,-100);
      await page.waitForTimeout(400);
      assert.equal(await opacity('.arrived'),0);
      assert.equal(await opacity('.art-caption'),0);
    });
    await verify('compact viewport uses the same complete scene motion', async () => {
      await page.setViewportSize({width:701,height:783});
      await visit('about');
      await page.locator('.is-active .scene-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
      await page.locator('#scrollCue').click();
      await page.waitForTimeout(130);
      const mid = await sample();
      assert.ok(mid.structure > 5 && mid.structure < mid.height);
      await settled();
      assert.ok(Math.abs((await sample()).structure) < 1);
      assert.equal(await page.locator('.is-active .scene-content').evaluate(el=>el.scrollTop),0);
    });
    await verify('reduced motion switches directly with all content visible', async () => {
      await page.emulateMedia({reducedMotion:'reduce'});
      await visit('about');
      await page.locator('.is-active .scene-content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
      await page.locator('#scrollCue').click();
      assert.equal(await page.evaluate(()=>document.body.dataset.scene),'structure');
      assert.ok(Math.abs((await sample()).structure) < 1);
      assert.equal(await page.evaluate(()=>!!document.body.dataset.sceneTransition),false);
    });
    if (failures.length) throw Error(failures.join('\n'));
    if (artifacts) fs.writeFileSync(path.join(artifacts,'motion-result.json'),JSON.stringify({checks,failures},null,2));
    console.log('All '+checks+' motion checks passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
