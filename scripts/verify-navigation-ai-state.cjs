'use strict';
// Full administrator page regression test. Only local synthetic data is used.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.NAV_TEST_PORT||8951);
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Local server startup timed out')),10000);
 server.stdout.on('data',chunk=>{if(String(chunk).includes('localhost:')){clearTimeout(timer);resolve();}});
 server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);if(code)reject(Error('Local server exited: '+code));});
});
const template=id=>({id,status:id==='active'?'active':'draft',title:'Synthetic navigation test',generationMethod:'manual',scoringEnabled:false,managementEnabled:false,questions:[{questionNo:1,questionText:'테스트 질문',answerType:'text',required:false,options:[]}]});
(async()=>{
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'chrome',headless:true});
  for(const mode of ['unconfigured','settings503','textOnly']){
   const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];let details=0;
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/api/checklist-templates',r=>r.fulfill({json:{templates:[template('active'),template('draft')]}}));
   for(const id of ['active','draft'])await page.route('**/api/checklist-templates/'+id,r=>{details++;return r.fulfill({json:{template:template(id)}});});
   await page.route('**/api/checklist-templates/ai-status',r=>r.fulfill({json:{configured:mode==='textOnly',files:false}}));
   await page.route('**/api/ai/settings',r=>r.fulfill({status:mode==='settings503'?503:200,json:mode==='settings503'?{message:'AI 키 암호화 설정이 필요합니다.'}:{canManage:true,state:{enabled:false,provider:'',model:'',connections:{},revision:0},services:[]}}));
   await page.goto(`http://localhost:${port}/index.html`);
   await page.locator('#loginId').fill('MOCKCENTRAL');await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
   await page.locator('.nav-tab[data-view="ai-settings"]').click();
   await page.waitForFunction(()=>!document.querySelector('#refresh-ai-readiness').disabled);
   await page.locator('.nav-tab[data-view="checklist-templates"]').click();
   await page.waitForFunction(()=>document.querySelector('#generateAiFileDraftButton').disabled);
   await page.locator('[data-template-id="active"]').click();
   await page.waitForFunction(()=>document.querySelector('#templateId').value==='active');
   assert.equal(await page.locator('#templateEditor').isVisible(),true);
   assert.equal(await page.locator('#templateTitle').isDisabled(),true);
   assert.equal(await page.locator('#saveTemplateButton').isVisible(),false);
   await page.locator('.nav-tab[data-view="dashboard"]').click();
   assert.match(page.url(),/#dashboard$/);
   await page.locator('.nav-tab[data-view="master"]').click();assert.match(page.url(),/#master$/);
   await page.locator('.nav-tab[data-view="checklist-templates"]').click();
   await page.locator('[data-template-id="draft"]').click();
   await page.waitForFunction(()=>document.querySelector('#templateId').value==='draft');
   assert.equal(await page.locator('#saveTemplateButton').isEnabled(),true);
   let releaseSave;
   await page.route('**/api/checklist-templates/draft',async r=>{
    if(r.request().method()!=='PATCH')return r.fulfill({json:{template:template('draft')}});
    await new Promise(resolve=>{releaseSave=resolve;});return r.fulfill({status:500,json:{message:'Synthetic save failure'}});
   });
   await page.locator('#saveTemplateButton').click();
   await page.waitForFunction(()=>document.querySelector('#saveTemplateButton').dataset.processing==='true');
   await page.locator('.nav-tab[data-view="dashboard"]').click();assert.match(page.url(),/#checklist-templates$/);
   await page.waitForFunction(()=>document.querySelector('#saveTemplateButton').textContent.includes('저장 중'));
   while(!releaseSave)await new Promise(r=>setTimeout(r,10));releaseSave();
   await page.waitForFunction(()=>!document.querySelector('#saveTemplateButton').dataset.processing);
   await page.locator('.nav-tab[data-view="dashboard"]').click();assert.match(page.url(),/#dashboard$/);
   assert(details>=2);assert.deepEqual(errors,[]);
   await page.close();console.log('PASS '+mode+': settings -> templates -> readonly detail -> menus -> draft -> save guard -> failure recovery');
  }
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
