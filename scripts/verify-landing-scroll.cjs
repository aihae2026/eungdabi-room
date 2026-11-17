/* Scroll regressions: node scripts/verify-landing-scroll.cjs <url> [playwright module path] */
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[3] || 'playwright');
const url = process.argv[2] || 'http://localhost:8769/landing.html';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const failures = [];
  let checks = 0;
  const verify = async (name, run) => {
    try { await run(); checks++; console.log('PASS ' + name); }
    catch (error) { failures.push(name + ': ' + error.message); console.log('FAIL ' + failures.at(-1)); }
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const state = () => page.evaluate(() => document.body.dataset.scene + ':' + document.body.dataset.step);
    const geometry = () => page.locator('.is-active .scene-content').evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
    const wheel = async delta => { await page.mouse.wheel(0, delta); await page.waitForTimeout(60); };
    let visits = 0;
    const visit = async id => {
      const destination = new URL(url);
      destination.searchParams.set('scroll-check', String(++visits));
      destination.hash = id;
      await page.goto(destination.href);
      await page.waitForFunction(() => !document.body.dataset.sceneTransition);
      await page.mouse.move(page.viewportSize().width / 2, 450);
    };
    await verify('quick wheel reversal undoes focus without waiting', async () => {
      await visit('structure');
      await wheel(100);
      assert.equal(await state(), 'structure:1');
      await wheel(-100);
      assert.equal(await state(), 'structure:0');
    });
    await verify('two deliberate same-direction gestures respond at a normal pace', async () => {
      await visit('structure');
      await wheel(100);
      await page.waitForTimeout(240);
      await wheel(100);
      assert.equal(await state(), 'structure:2');
    });
    const sequence = ['welcome:0','welcome:1','about:0','structure:0','structure:1','structure:2','structure:3','ai:0','ai:1','field:0','field:1','guides:0','guides:1','guides:2','guides:3','guides:4','faq:0','faq:1','faq:2','faq:3','start:0'];
    for (const viewport of [{width:1440,height:783},{width:1200,height:800},{width:1050,height:783},{width:701,height:783},{width:686,height:900},{width:1440,height:720},{width:1366,height:768},{width:641,height:720}]) {
      await verify('every stage fits and moves directly in both directions at ' + viewport.width + 'x' + viewport.height, async () => {
        await page.setViewportSize(viewport);
        await visit('welcome');
        for (let n = 0; n < sequence.length; n++) {
          await page.waitForFunction(() => !document.body.dataset.sceneTransition);
          assert.equal(await state(), sequence[n]);
          const pos = await geometry();
          assert.ok(pos.max <= 2 && pos.top <= 2, sequence[n] + ': unexpected inner scrolling ' + JSON.stringify(pos));
          if (n < sequence.length - 1) {
            if (viewport.width === 701) {
              await page.waitForTimeout(310);
              await wheel(100);
            } else await page.locator('#scrollCue').click();
          }
        }
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        for (let n = sequence.length - 2; n >= 0; n--) {
          await page.waitForTimeout(310);
          await wheel(-100);
          await page.waitForFunction(() => !document.body.dataset.sceneTransition);
          assert.equal(await state(), sequence[n]);
          assert.ok((await geometry()).top <= 2, sequence[n] + ': backward input moved the body');
        }
        // A fresh down gesture after reversing must advance, without a preliminary nudge.
        await wheel(100);
        assert.equal(await state(), 'welcome:1');
        assert.ok((await geometry()).top <= 2);
      });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await verify('navigation button advances even when a narrow phone has unread content', async () => {
      await visit('about');
      assert.ok((await geometry()).max > 100);
      await page.locator('#scrollCue').click();
      await page.waitForFunction(() => !document.body.dataset.sceneTransition);
      assert.equal(await state(), 'structure:0');
      assert.ok((await geometry()).top <= 2);
    });
    await verify('backward navigation restores the previous scene at its end', async () => {
      await visit('structure');
      await page.locator('[data-room-step="3"]').click();
      await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.locator('#scrollCue').click();
      await page.locator('#previousStep').click();
      assert.equal(await state(), 'structure:3');
      const pos = await geometry();
      assert.ok(pos.max > 100 && Math.abs(pos.top - pos.max) <= 2, JSON.stringify(pos));
    });
    await verify('wheel reversal keeps the visible illustration in place', async () => {
      await visit('structure');
      await page.locator('[data-room-step="3"]').click();
      await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const before = await geometry();
      await page.waitForTimeout(240);
      await wheel(-100);
      assert.equal(await state(), 'structure:2');
      assert.ok(Math.abs((await geometry()).top - before.top) <= 2);
    });
    await verify('forward scene inertia does not move the new scene underneath the user', async () => {
      await visit('about');
      await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await wheel(150);
      assert.equal(await state(), 'structure:0');
      for (let n = 0; n < 8; n++) await wheel(100 - n * 8);
      assert.equal(await state(), 'structure:0');
      assert.ok((await geometry()).top <= 2, JSON.stringify(await geometry()));
    });
    await verify('reverse scene inertia does not move the restored viewport', async () => {
      await visit('ai');
      await wheel(-100);
      assert.equal(await state(), 'structure:3');
      const before = await geometry();
      assert.ok(before.max > 100 && Math.abs(before.top - before.max) <= 2);
      for (let n = 0; n < 8; n++) await wheel(-90 + n * 8);
      assert.equal(await state(), 'structure:3');
      assert.ok(Math.abs((await geometry()).top - before.top) <= 2);
    });
    await verify('reverse touch swipe undoes a visible focus before scrolling the text', async () => {
      await visit('structure');
      await page.locator('[data-room-step="3"]').click();
      await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const before = await geometry();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:195,y:420}]});
      for (const y of [450,490,530,580]) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:195,y}]});
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      await cdp.detach();
      assert.equal(await state(), 'structure:2');
      assert.ok(Math.abs((await geometry()).top - before.top) <= 2);
    });
    if (failures.length) throw new Error(failures.join('\n'));
    console.log('All ' + checks + ' scroll regression checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
