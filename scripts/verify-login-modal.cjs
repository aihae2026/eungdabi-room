// Run against the synthetic dev:mock server; never use real credentials.
// node scripts/verify-login-modal.cjs http://localhost:8917 <playwright module path> [screenshot]
const assert = require('node:assert/strict');
const {chromium} = require(process.argv[3] || 'playwright');
const base = process.argv[2] || 'http://localhost:8917';
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const rootResponse = await page.request.get(base+'/', {maxRedirects:0});
    assert.equal(rootResponse.status(),302);
    assert.equal(rootResponse.headers().location,'/landing#welcome');
    const legacyResponse = await page.request.get(base+'/index.html', {maxRedirects:0});
    assert.equal(legacyResponse.headers().location,'/admin');
    const intakeResponse = await page.request.get(base+'/intake.html?agency=MOCKAG001', {maxRedirects:0});
    assert.equal(intakeResponse.status(),200);
    assert.equal(intakeResponse.headers().location,undefined);
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    const open = async () => {await page.goto(base+'/');await page.locator('.login-link').click();await page.waitForFunction(()=>document.querySelector('#loginDialog').open);};
    await open();
    assert.match(page.url(), /\/landing#welcome$/);
    assert.equal(await page.locator('#welcome').evaluate(el=>el.classList.contains('is-active')),true);
    assert.equal(await page.locator('#landingLoginId').evaluate(el=>el===document.activeElement),true);
    const state=await page.evaluate(()=>document.body.dataset.scene+document.body.dataset.step);
    await page.keyboard.press('PageDown');await page.mouse.wheel(0,500);await page.waitForTimeout(650);
    assert.equal(await page.evaluate(()=>document.body.dataset.scene+document.body.dataset.step),state);
    const backdrop=await page.locator('#loginDialog').evaluate(el=>getComputedStyle(el,'::backdrop').backdropFilter);
    assert.match(backdrop,/blur/);
    if(process.argv[4])await page.screenshot({path:process.argv[4]});
    await page.locator('#landingLoginId').fill('INVALID');await page.locator('#landingLoginPassword').fill('synthetic-invalid');await page.locator('.login-submit').click();
    await page.waitForFunction(()=>document.querySelector('#landingLoginError').textContent.length>0);
    assert.match(page.url(),/\/landing#welcome$/);
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#loginDialog').open);
    await page.waitForFunction(()=>document.querySelector('#landingLoginPassword').value==='');
    assert.equal(await page.locator('.login-link').evaluate(el=>el===document.activeElement),true);
    // Existing field guide is independent of login.
    await page.locator('[data-field-guide]').first().click();await page.waitForFunction(()=>document.querySelector('#fieldDialog').open);await page.keyboard.press('Escape');
    // Close while a request is pending: no delayed navigation or session write.
    let release;const pending=new Promise(r=>release=r);
    await page.route('**/api/login',async route=>{await pending;await route.fulfill({json:{token:'synthetic-test',agency:{code:'MOCKAG001'}}}).catch(()=>{});});
    await page.locator('.login-link').click();await page.locator('#landingLoginId').fill('MOCKAG001');await page.locator('#landingLoginPassword').fill('mock1234');await page.locator('.login-submit').click();await page.keyboard.press('Escape');release();await page.waitForTimeout(100);await page.unroute('**/api/login');
    assert.match(page.url(),/\/landing#welcome$/);assert.equal(await page.evaluate(()=>sessionStorage.getItem('lifeSafetyAdminAuthenticated')),null);
    for(const code of ['MOCKCENTRAL','MOCKREGION1','MOCKAG001']){
      await page.evaluate(()=>sessionStorage.clear());await open();await page.locator('#landingLoginId').fill(code.toLowerCase());await page.locator('#landingLoginPassword').fill('mock1234');await page.locator('.login-submit').click();await page.waitForURL('**/admin*');await page.waitForFunction(()=>!document.querySelector('#appShell').classList.contains('is-hidden'));
    }
    await page.evaluate(()=>sessionStorage.clear());await page.goto(base+'/index.html');await page.locator('#loginId').fill('MOCKAG001');await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();await page.waitForFunction(()=>!document.querySelector('#appShell').classList.contains('is-hidden'));
    await page.evaluate(()=>sessionStorage.clear());await page.setViewportSize({width:390,height:844});await page.goto(base+'/');await page.locator('.menu-toggle').click();await page.locator('.login-link').click();
    const box=await page.locator('#loginDialog').boundingBox();assert(box.x>=0&&box.x+box.width<=390);await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement===document.querySelector('.menu-toggle'));assert.equal(await page.locator('.menu-toggle').evaluate(el=>el===document.activeElement),true);
    await page.goto(base+'/landing.html#start');await page.locator('.start-actions [data-login-modal]').click();assert.equal(await page.locator('#loginDialog').evaluate(el=>el.open),true);
    const nojs=await browser.newPage({javaScriptEnabled:false});await nojs.goto(base+'/');await nojs.locator('.login-link').click();assert.match(nojs.url(),/\/admin$/);
    assert.deepEqual(errors,[]);console.log('PASS modal focus/backdrop/scroll/close/errors/cancel; three roles; direct login; mobile; CTA; no-JS fallback.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
