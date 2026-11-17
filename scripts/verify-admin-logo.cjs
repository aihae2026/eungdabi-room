// Synthetic dev:mock server only. node scripts/verify-admin-logo.cjs <base URL> <playwright path>
const assert = require('node:assert/strict');
const {chromium} = require(process.argv[3] || 'playwright');
const base = process.argv[2] || 'http://localhost:8919';
(async () => {
 const browser = await chromium.launch();
 try {
  await Promise.all(['MOCKCENTRAL','MOCKREGION1','MOCKAG001'].map(async code => {
   const page = await browser.newPage({reducedMotion:'no-preference'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/index.html');
   await page.waitForFunction(()=>!!document.querySelector('eungdabiroom-logo')?.shadowRoot);
   await page.waitForTimeout(5100);
   assert.equal(await page.locator('eungdabiroom-logo').evaluate(el=>el.played),false);
   await page.locator('#loginId').fill(code);await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
   await page.waitForFunction(()=>document.querySelector('eungdabiroom-logo').played);
   await page.waitForTimeout(600);
   const logo=page.locator('eungdabiroom-logo');
   const during=await logo.locator('svg > g').first().getAttribute('transform');
   await page.waitForTimeout(4500);
   const end=await logo.locator('svg').innerHTML();
   assert.notEqual(during,await logo.locator('svg > g').first().getAttribute('transform'));
   await page.locator('.nav-tab[data-view="stats"]').click();await page.locator('.brand-home').click();
   await page.waitForFunction(()=>document.querySelector('#view-home.is-active'));
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('lifeSafetyAdminAgencyCode')),code);
   await page.waitForTimeout(250);assert(end===await logo.locator('svg').innerHTML());
   await page.setViewportSize({width:390,height:844});await page.locator('#mobileWorkMenu').selectOption('stats');await page.locator('.brand-home').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#view-home.is-active'));
   const box=await logo.boundingBox();assert(box.x>=0&&box.x+box.width<=390);
   await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('eungdabiroom-logo')?.played);assert(end===await logo.locator('svg').innerHTML());
   assert.deepEqual(errors,[]);console.log('PASS',code,'wait for login, entrance, settle, home, mobile/keyboard, session, reduced motion');
   await page.close();
  }));
  const page=await browser.newPage({reducedMotion:'no-preference'});await page.goto(base+'/docs/header-logo-preview.html');await page.waitForFunction(()=>document.querySelector('eungdabiroom-logo')?.played);console.log('PASS existing non-deferred logo starts normally');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
