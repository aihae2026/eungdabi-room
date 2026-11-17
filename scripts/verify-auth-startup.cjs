'use strict';
// Synthetic local API only: no production accounts or writes.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const base='http://127.0.0.1:8973';
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),'8973'],{stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('mock server timeout')),10000);
  server.stdout.on('data',data=>{if(String(data).includes('localhost:')){clearTimeout(timer);resolve();}});
  server.on('error',reject);
});
(async()=>{
  let browser;
  try {
    await ready;
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage();
    page.setDefaultTimeout(10000);
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    // Delay app.js: the server HTML must never expose the login form during hydration.
    let releaseScript;
    const gate=new Promise(resolve=>releaseScript=resolve);
    await page.route('**/assets/app.js?*',async route=>{await gate;await route.continue();});
    await page.goto(base+'/admin',{waitUntil:'commit'});
    await page.locator('#authBootStatus').waitFor({state:'visible'});
    assert.equal(await page.locator('#loginScreen').isVisible(),false);
    assert.equal(await page.locator('#appShell').isVisible(),false);
    releaseScript();
    await page.locator('#loginScreen').waitFor({state:'visible'});
    await page.unroute('**/assets/app.js?*');

    // Successful popup login, deliberately slow initial institution request.
    let releaseData;
    const pending=new Promise(resolve=>releaseData=resolve);
    await page.route('**/api/institutions',async route=>{await pending;await route.continue();});
    let logins=0;
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/login')logins++;});
    await page.goto(base+'/landing#welcome');
    await page.locator('.login-link').click();
    await page.locator('#landingLoginId').fill('MOCKCENTRAL');
    await page.locator('#landingLoginPassword').fill('mock1234');
    await page.locator('.login-submit').click();
    await page.waitForURL('**/admin#home');
    await page.locator('#appShell').waitFor({state:'visible'});
    assert.equal(await page.locator('#loginScreen').isVisible(),false);
    await page.locator('.nav-tab[data-view="dashboard"]').click();
    await page.waitForURL('**/admin#dashboard');
    assert.equal(logins,1);
    releaseData();
    await page.waitForFunction(()=>homeSummaryData!==null);
    await page.unroute('**/api/institutions');
    assert.match(page.url(),/#dashboard$/); // late data must not navigate back home

    // Server error is recoverable; event handlers remain active after refresh.
    await page.route('**/api/institutions',r=>r.fulfill({status:503,json:{error:'synthetic outage'}}));
    await page.reload();
    await page.locator('#startupError').waitFor({state:'visible'});
    assert.equal(await page.locator('#appShell').isVisible(),true);
    await page.unroute('**/api/institutions');
    await page.locator('#startupRetry').click();
    await page.waitForFunction(()=>homeSummaryData!==null);
    assert.equal(await page.locator('#startupError').isVisible(),false);

    // Hanging request has a bounded wait and retains the current session for retry.
    await page.route('**/api/institutions',()=>{});
    await page.reload();
    await page.locator('#startupError').waitFor({state:'visible',timeout:20000});
    assert.match(await page.locator('#startupErrorMessage').innerText(),/지연/);
    assert.equal(await page.locator('#appShell').isVisible(),true);
    await page.unroute('**/api/institutions');
    await page.locator('#startupRetry').click();
    await page.waitForFunction(()=>homeSummaryData!==null);

    // A real 401 response, not mere presence of a stored token, ends the session.
    await page.route('**/api/institutions',r=>r.fulfill({status:401,json:{error:'expired'}}));
    await page.reload();
    await page.locator('#loginScreen').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('lifeSafetyAdminToken')),null);
    assert.equal(await page.locator('#appShell').isVisible(),false);
    await page.unroute('**/api/institutions');
    await page.locator('#loginId').fill('MOCKCENTRAL');
    await page.locator('#loginPassword').fill('mock1234');
    await page.locator('#loginSubmitButton').click();
    await page.locator('#appShell').waitFor({state:'visible'});
    await page.locator('#logoutButton').click();
    await page.waitForURL('**/landing#welcome');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('lifeSafetyAdminToken')),null);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('lifeSafetyAdminAuthenticated')),null);
    await page.goto(base+'/admin#home');
    await page.locator('#loginScreen').waitFor({state:'visible'});
    assert.equal(await page.locator('#appShell').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS initial paint, popup handoff, single login, slow API menu navigation, refresh, 503 retry, timeout retry, expired session; no browser errors.');
  } finally {
    if(browser)await browser.close();
    server.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
