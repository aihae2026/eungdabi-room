'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const port=8975,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port)],{stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.on('data',data=>{if(String(data).includes('localhost:')){clearTimeout(timer);resolve();}});server.on('error',reject);});
(async()=>{let browser;try{
  await ready;browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let mode='normal';
  await page.route(/\/api\/(checklist-templates|home-templates)$/,r=>{
    if(mode==='error')return r.fulfill({status:503,json:{error:'synthetic failure'}});
    if(mode==='network')return r.abort('failed');
    return r.fulfill({json:{templates:mode==='empty'?[]:[{id:'one',title:'운영 설문 <b>테스트</b>',status:'active',description:'설명'},{id:'two',title:'초안 제외',status:'draft'},{id:'three',title:'종료 제외',status:'closed'}]}});
  });
  for(const code of ['MOCKCENTRAL','MOCKREGION1','MOCKAG001']){
    mode='normal';await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+'/admin');
    await page.locator('#loginId').fill(code);await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
    await page.waitForFunction(()=>homeSummaryData!==null && document.querySelectorAll('.v8-queue-item').length===1);
    assert.equal(await page.locator('.v8-queue-item').count(),1);
    assert.match(await page.locator('.v8-queue').innerText(),/운영 중인 설문/);
    assert.equal(await page.locator('.v8-queue-item h3').innerText(),'운영 설문 <b>테스트</b>');
    assert.equal(await page.locator('.v8-queue-item h3 b').count(),0);
    assert.equal(await page.locator('.v8-secondary-grid').count(),0);
    assert.equal(await page.locator('.v8-queue [data-v8-template]').count(),code==='MOCKCENTRAL'?1:0);
    for(const failure of ['error','network']) {
      mode=failure;await page.reload();await page.locator('.v8-queue [role="alert"]').waitFor();
      assert.equal(await page.locator('.v8-queue-item').count(),0);
      mode='normal';await page.locator('.v8-queue [data-v8-home-retry]').click();await page.locator('.v8-queue-item').waitFor();
      assert.equal(await page.locator('.v8-queue-item').count(),1);
    }
    mode='empty';await page.reload();await page.waitForFunction(()=>document.querySelector('.v8-queue')?.textContent.includes('운영 중인 설문이 없습니다'));
    assert.equal(await page.locator('.v8-queue-item').count(),0);
    mode='normal';await page.reload();await page.locator('.v8-queue-item').waitFor();
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    console.log(`PASS ${code}: active-only cards, 503/network error and retry, empty/reload, mobile, no privileged action leakage.`);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#logoutButton').click();await page.waitForURL('**/landing#welcome');
  }
  assert.deepEqual(errors,[]);console.log('PASS home survey cards: three roles, active only, escaped text, removed secondary grid, error/retry/empty, mobile.');
}finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
