'use strict';
// Real Chrome with local synthetic API responses only.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=8965;
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port),'--admin-ux'],{cwd:root,stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.on('data',s=>{if(String(s).includes('localhost:')){clearTimeout(timer);resolve();}});server.on('error',reject);});
(async()=>{let browser;try{
 await ready;browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 const id='11111111-1111-4111-8111-111111111111',row={id,agencyCode:'MOCKAG001',templateId:'22222222-2222-4222-8222-222222222222',checklistTitle:'검증 설문',scoringEnabled:false,submittedAt:'2026-09-16T00:00:00Z',workerName:'김수진',workerPhone:'010-1234-5678',clientName:'홍길동',clientGender:'남',clientBirth:'1950-01-01',clientId:'',status:'확인 대기',answers:[{questionNo:1,questionText:'질문',answerLabel:'답변'}]};let fail=false;
 await page.route('**/api/submissions**',async r=>{
  const url=new URL(r.request().url());
  if(r.request().method()==='PATCH'){
   const body=r.request().postDataJSON();writes.push({path:url.pathname,body});if(fail)return r.fulfill({status:500,json:{message:'합성 상태 변경 실패'}});
   if(url.pathname.endsWith('/complete'))row.status='확인 완료';else if(url.pathname.endsWith('/reopen'))row.status='확인 대기';
   Object.assign(row,body);return r.fulfill({json:{submission:row}});
  }
  return r.fulfill({json:url.pathname.endsWith(id)?{submission:row}:{rows:[row],pagination:{page:1,limit:20,totalCount:1,totalPages:1,start:1,end:1}}});
 });
 async function login(code){await page.locator('#loginId').fill(code);await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();await page.locator('.nav-tab[data-view="dashboard"]').click();await page.locator('#v8QuerySubmissions').click();await page.locator('[data-open-detail]').first().click();await page.locator('#detailDrawer.is-open').waitFor();}
 await page.goto(`http://127.0.0.1:${port}/admin`);await login('MOCKAG001');
 assert.equal(await page.locator('#detailDrawer').evaluate(el=>Math.round(el.getBoundingClientRect().width)),1040);
 assert.equal(await page.locator('.detail-completion-inline strong').innerText(),'제출 내용 확인 후 확인 완료 처리');
 assert.doesNotMatch(await page.locator('#detailContent').innerText(),/7자리|확인 완료 시 필수|H\*\*\*\*\*/);
 assert.equal(await page.locator('#editClientId').getAttribute('maxlength'),null);assert.equal(await page.locator('#editClientId').getAttribute('inputmode'),null);assert.equal(await page.locator('#editClientId').getAttribute('placeholder'),null);
 await page.locator('[data-complete-submission]').click();await page.locator('[data-reopen-submission]').waitFor();assert.equal(writes.at(-1).body.clientId,'');assert.equal(row.status,'확인 완료');
 await page.locator('[data-reopen-submission]').click();await page.locator('[data-complete-submission]').waitFor();assert.equal(row.status,'확인 대기');
 const value='운영기관-A/2026 000123456789 <b> & "번호"';await page.locator('#editClientId').fill(value);await page.locator('[data-save-submission]').click();await page.waitForFunction(()=>!detailBusy);assert.equal(row.clientId,value);assert.equal(await page.locator('#editClientId').inputValue(),value);
 await page.locator('[data-complete-submission]').click();await page.locator('[data-reopen-submission]').waitFor();assert.equal(row.clientId,value);assert.equal(await page.locator('.detail-completion-inline b').count(),0);
 fail=true;await page.locator('[data-reopen-submission]').click();await page.waitForFunction(()=>!detailBusy);assert.match(await page.locator('#detailError').innerText(),/합성 상태 변경 실패/);assert.equal(row.status,'확인 완료');assert(await page.locator('[data-reopen-submission]').isEnabled());fail=false;
 await page.locator('[data-reopen-submission]').click();await page.locator('[data-complete-submission]').waitFor();assert.equal(await page.locator('#editClientId').inputValue(),value);
 await page.locator('#editClientId').fill('');await page.locator('[data-save-submission]').click();await page.waitForFunction(()=>!detailBusy);assert.equal(row.clientId,'');
 await page.screenshot({path:path.join(root,'outputs/submission-detail-desktop.png')});
 await page.setViewportSize({width:390,height:844});assert(await page.locator('#detailDrawer').evaluate(el=>el.scrollWidth<=el.clientWidth));
 assert.equal(await page.locator('.detail-completion-inline strong').innerText(),'제출 내용 확인 후 확인 완료 처리');
 await page.locator('[data-complete-submission]').scrollIntoViewIfNeeded();
 await page.screenshot({path:path.join(root,'outputs/submission-detail-mobile.png')});
 await page.locator('#closeDrawer').click();await page.evaluate(()=>logout());await page.waitForURL('**/landing#welcome');await page.goto(`http://127.0.0.1:${port}/admin`);await page.setViewportSize({width:1440,height:1000});await login('MOCKCENTRAL');assert.equal(await page.locator('[data-complete-submission], [data-reopen-submission], #editClientId').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS detail Chrome: 1040px drawer, unrestricted/blank ID, save, complete/reopen, safe HTML display, failed mutation recovery, read-only central, mobile fit.');
}finally{if(browser)await browser.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
