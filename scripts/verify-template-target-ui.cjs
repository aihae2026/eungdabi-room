'use strict';
// Full-page Chrome UI with synthetic endpoint fixtures. No production API/DB writes.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const port=8962,root=path.resolve(__dirname,'..');
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port),'--admin-ux'],{cwd:root,stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),10000);server.stdout.on('data',s=>{if(String(s).includes('localhost:')){clearTimeout(timer);resolve();}});server.on('error',reject);});
(async()=>{
 let browser;
 try {
  await ready;browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(10000);
  const rows=[{code:'R1',name:'첫 그룹',type:'regional',active:true},{code:'R2',name:'둘째 그룹',type:'regional',active:true},{code:'A1',name:'첫 기관',type:'agency',parentCode:'R1',active:true},{code:'A2',name:'둘째 기관',type:'agency',parentCode:'R2',active:true},{code:'OFF',name:'비활성 기관',type:'agency',parentCode:'R1',active:false}];
  await page.route('**/api/checklist-target-institutions',r=>r.fulfill({json:{institutions:rows}}));
  let savedTarget={mode:'all',codes:[],revision:0},saveCount=0,fail=false,delay=false,release;
  await page.route('**/api/checklist-templates/preview-draft/targets',async r=>{
   saveCount++;const value=r.request().postDataJSON().submissionTargets;
   if(delay)await new Promise(resolve=>release=resolve);
   if(fail)return r.fulfill({status:500,json:{message:'합성 저장 실패'}});
   savedTarget={...value,revision:savedTarget.revision+1};return r.fulfill({json:{submissionTargets:savedTarget}});
  });
  await page.goto(`http://127.0.0.1:${port}/admin`);
  await page.locator('#loginId').fill('MOCKCENTRAL');await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
  await page.locator('.nav-tab[data-view="checklist-templates"]').click();await page.locator('[data-template-id="preview-draft"]').click();
  await page.waitForFunction(()=>document.querySelector('#templateTargetLoadStatus')?.textContent === '' && document.querySelector('[data-target-code="A1"]'));
  await page.locator('#templateTargetMode').selectOption('selected');
  await page.locator('#saveTemplateButton').click();assert.match(await page.locator('#toast').innerText(),/최소 1개/);
  await page.locator('#templateTargetGroup').selectOption('R1');assert.equal(await page.locator('[data-target-code="A2"]').count(),0);
  assert(await page.locator('[data-target-code="OFF"]').isDisabled());
  await page.locator('#templateTargetSelectAll').click();assert(await page.locator('[data-target-code="A1"]').isChecked());
  await page.locator('#templateTargetGroup').selectOption('R2');await page.locator('#templateTargetSearch').fill('A2');await page.locator('[data-target-code="A2"]').check();
  assert.match(await page.locator('#templateTargetSummary').innerText(),/2개/);
  await page.locator('#saveTemplateButton').click();await page.waitForFunction(()=>!document.querySelector('#activateTemplateButton').disabled);
  assert.deepEqual(await page.evaluate(()=>TemplateTargets.value().codes),['A1','A2']);
  await page.locator('#activateTemplateButton').click();await page.locator('#saveTemplateTargetsButton').waitFor({state:'visible'});
  assert(await page.locator('#templateTitle').isDisabled());assert(await page.locator('#templateTargetMode').isEnabled());
  await page.locator('#templateTargetClear').click();await page.locator('#saveTemplateTargetsButton').click();assert.equal(saveCount,0);
  await page.locator('#templateTargetGroup').selectOption('R1');await page.locator('[data-target-code="A1"]').check();
  fail=true;await page.locator('#saveTemplateTargetsButton').click();await page.waitForFunction(()=>!document.querySelector('#saveTemplateTargetsButton').dataset.processing);
  assert.deepEqual(await page.evaluate(()=>TemplateTargets.value().codes),['A1']);assert.match(await page.locator('#toast').innerText(),/합성 저장 실패/);
  fail=false;delay=true;await page.locator('#saveTemplateTargetsButton').click();await page.waitForFunction(()=>document.querySelector('#saveTemplateTargetsButton').dataset.processing==='true');
  await page.locator('.nav-tab[data-view="home"]').click();assert(await page.locator('#view-checklist-templates').evaluate(el=>el.classList.contains('is-active')));
  release();await page.waitForFunction(()=>!document.querySelector('#saveTemplateTargetsButton').dataset.processing);assert.deepEqual(savedTarget.codes,['A1']);
  assert(await page.locator('#saveTemplateTargetsButton').isDisabled());
  await page.setViewportSize({width:390,height:844});await page.locator('#templateTargetSearch').fill('A1');assert.equal(await page.locator('[data-target-code="A1"]').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#templateSubmissionTargets').screenshot({path:path.join(root,'outputs/template-targets-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#templateSubmissionTargets').screenshot({path:path.join(root,'outputs/template-targets-desktop.png')});
  assert.deepEqual(errors,[]);console.log('PASS Chrome UI: draft persistence, empty selection, grouped search, bulk select, inactive guard, active-only target edit, failed-save preservation, in-flight navigation guard, mobile overflow, no JS errors.');
 } finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
