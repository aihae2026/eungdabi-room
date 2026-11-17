/* Optional browser checks: node scripts/verify-landing.cjs <url> [playwright module path] [artifacts directory] */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.argv[3] || 'playwright');
const url = process.argv[2] || 'http://localhost:8769/landing.html';
const artifacts = process.argv[4];
if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let checks = 0;
  const errors = [], requests = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      window.landingWheelTrace = [];
      addEventListener('wheel', event => {
        if (landingWheelTrace.length < 100) landingWheelTrace.push({at:performance.now(),delta:event.deltaY});
      }, {capture:true});
    });
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (['fetch', 'xhr'].includes(r.resourceType())) requests.push(r.url()); });
    const state = () => page.evaluate(() => document.body.dataset.scene + ':' + document.body.dataset.step);
    const settled = () => page.waitForFunction(() => !document.body.dataset.sceneTransition);
    const visit = async id => { await page.goto(url + '#' + id); await page.waitForFunction(() => document.body.classList.contains('enhanced')); await settled(); };
    const check = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
    const capture = async name => { if (artifacts) await page.screenshot({ path: path.join(artifacts, name + '.png') }); };

    await visit('welcome');
    check((await page.locator('h1').innerText()).includes('작은 응답이 모여'), 'native heading is present');
    const title = page.locator('h1');
    const bounds = await title.boundingBox();
    await page.mouse.move(bounds.x + 3, bounds.y + 28);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + 100, { steps: 12 });
    await page.mouse.up();
    check((await page.evaluate(() => getSelection().toString())).includes('응답'), 'real mouse drag selects heading text');
    await page.evaluate(() => getSelection().removeAllRanges());
    await capture('desktop-main');

    await page.mouse.move(700, 440);
    await page.mouse.wheel(0, 9000);
    await page.waitForTimeout(80);
    check(await state() === 'welcome:1', 'huge wheel delta advances exactly one stage');
    for (let n = 0; n < 22; n++) { await page.mouse.wheel(0, 40 - n); await page.waitForTimeout(80); }
    if (await state() !== 'welcome:1') console.log('Wheel timing:', await page.evaluate(() => landingWheelTrace.map((entry, i) => ({...entry, gap:i ? entry.at - landingWheelTrace[i-1].at : 0}))));
    check(await state() === 'welcome:1', 'continuous inertia over several seconds cannot advance again');
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(70);
    check(await state() === 'about:0', 'a fresh gesture reaches the about page');
    check(await page.locator('#about').evaluate(el => el.getAnimations().some(animation => animation.playState === 'running')), 'whole-scene navigation slides toward a complete landing');
    await settled();

    await visit('structure');
    for (let i = 1; i <= 3; i++) {
      await page.locator('[data-room-step="' + i + '"]').click();
      await page.waitForTimeout(700);
      check(await page.locator('[data-room-step="' + i + '"]').getAttribute('aria-pressed') === 'true', 'institution focus ' + i + ' matches the selected role');
      check(await page.locator('.is-active .scene-content').evaluate(el => el.scrollHeight <= el.clientHeight + 2), 'institution view ' + i + ' fits one desktop viewport');
      await capture('desktop-structure-' + i);
    }
    check(await page.locator('#roomCaption').innerText() === '현장조사자의 응답이 소속 기관담당자에 쌓입니다.', 'the focused artwork explains the institutional relationship');
    await page.locator('[data-room-step="0"]').click();
    await page.waitForTimeout(700);
    await capture('desktop-structure-whole');

    const expected = ['welcome:0','welcome:1','about:0','structure:0','structure:1','structure:2','structure:3','ai:0','ai:1','field:0','field:1','guides:0','guides:1','guides:2','guides:3','guides:4','faq:0','faq:1','faq:2','faq:3','start:0'];
    await visit('welcome');
    for (let n = 0; n < expected.length; n++) {
      await settled();
      check(await state() === expected[n], 'ordered sequence ' + expected[n]);
      const dimensions = await page.locator('.is-active .scene-content').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth }));
      check(dimensions.scrollWidth <= dimensions.width + 1, 'no horizontal overflow at ' + expected[n]);
      if (expected[n] === 'ai:1') check(await page.locator('#aiDraft').isVisible(), 'draft opens as native text');
      if (expected[n] === 'field:1') check(await page.locator('input[value="neutral"]').isChecked(), 'scroll selects the example response');
      if (expected[n].startsWith('faq:')) check(await page.locator('.faq-list details').nth(Number(expected[n].split(':')[1])).getAttribute('open') !== null, 'scroll opens FAQ answer ' + expected[n]);
      if (artifacts && ['about:0','ai:1','field:1','guides:4','faq:0','start:0'].includes(expected[n])) await capture('desktop-' + expected[n].replace(':','-'));
      // The navigation button must advance directly from the scene's arrival position.
      if (n < expected.length - 1) await page.locator('#scrollCue').click();
    }
    await visit('welcome');
    await page.keyboard.press('PageDown');
    await page.keyboard.down('PageDown');
    await page.keyboard.down('PageDown');
    await page.keyboard.up('PageDown');
    check(await state() === 'about:0', 'held keyboard repeats are ignored');
    await page.keyboard.press('PageUp');
    check(await state() === 'welcome:1', 'reverse keyboard navigation restores previous stage');

    await page.locator('#siteNav [data-field-guide]').click();
    check(await page.locator('#fieldDialog').isVisible(), 'header field guide opens');
    check((await page.locator('#fieldDialog').innerText()).includes('지역 운영담당자의 조사 담당자'), 'guide identifies who supplies the address');
    await page.mouse.move(650, 450); await page.mouse.wheel(0, 9000);
    check(await state() === 'welcome:1', 'scrolling a dialog does not advance the landing');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement === document.querySelector('#siteNav [data-field-guide]'));
    check(await page.locator('#siteNav [data-field-guide]').evaluate(el => el === document.activeElement), 'dialog returns focus to its opener');
    check(requests.length === 0, 'landing and examples send no data or AI requests');

    await page.locator('#siteNav .login-link').click();
    check(await page.locator('#loginDialog').isVisible(), 'administrator link opens the login modal');
    await page.keyboard.press('Escape');

    for (const size of [{width:390,height:844},{width:686,height:900},{width:320,height:640}]) {
      await page.setViewportSize(size);
      for (const id of ['welcome','about','structure','ai','field','guides','faq','start']) {
        await visit(id);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.is-active .scene-content').scrollWidth <= document.querySelector('.is-active .scene-content').clientWidth + 1), 'responsive overflow ' + size.width + ' ' + id);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await visit('welcome');
    await capture('mobile-main');
    await page.locator('.menu-toggle').click();
    check(await page.locator('#siteNav .login-link').isVisible(), 'mobile menu exposes administrator login');
    await page.locator('#siteNav [data-field-guide]').click();
    await capture('mobile-field-guide');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement === document.querySelector('#siteNav [data-field-guide]'));
    check(await page.locator('#siteNav [data-field-guide]').evaluate(el => el === document.activeElement), 'mobile dialog restores visible opener focus');
    await page.keyboard.press('Escape');
    await page.mouse.move(170, 350);
    await page.mouse.wheel(0, 9000);
    await page.waitForTimeout(120);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    check(await state() === 'welcome:0', 'reaching the end of mobile content does not also advance a scene');
    await page.waitForTimeout(950);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(80);
    check(await state() === 'welcome:1', 'fresh mobile wheel gesture advances after reading');

    await visit('structure');
    await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:170,y:600}]});
    for (const y of [570,530,490,440,400]) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:170,y}]});
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    check(await state() === 'structure:1', 'one touch swipe advances exactly one focus stage');
    await cdp.detach();

    await visit('start');
    await page.locator('.is-active .scene-content').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('.site-footer a[href="#welcome"]').click();
    await page.waitForFunction(() => !document.body.dataset.sceneTransition);
    check(await state() === 'welcome:0', 'footer returns directly to the first scene');

    const fallback = await browser.newPage({javaScriptEnabled:false, viewport:{width:390,height:844}});
    await fallback.goto(url);
    check(await fallback.locator('#about').isVisible() && await fallback.locator('[data-guide="4"]').isVisible(), 'no-JavaScript fallback keeps all content readable');
    check(await fallback.locator('#siteNav .login-link').isVisible(), 'no-JavaScript fallback retains real login');
    const reduced = await browser.newPage({reducedMotion:'reduce'});
    await reduced.goto(url + '#structure');
    check(await reduced.locator('.room-window').evaluate(el => getComputedStyle(el).transitionDuration === '0s'), 'reduced motion removes zoom movement');

    check(errors.length === 0, 'no browser runtime errors');
    if (artifacts) fs.writeFileSync(path.join(artifacts, 'browser-result.json'), JSON.stringify({checks, errors, landingDataRequests:requests, browser:'Chrome', viewport:[1440,900], mobileWidths:[390,686,320]}, null, 2));
    console.log('All ' + checks + ' browser checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
