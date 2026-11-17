'use strict';
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.INTAKE_TEST_PORT || 8968);
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.on('data',s=>{if(String(s).includes('localhost:')){clearTimeout(timer);resolve();}});server.on('error',reject);});
(async()=>{
 let browser;
 try{
  await ready;browser=await chromium.launch({channel:'chrome',headless:true});
  const desktop=process.argv.includes('--desktop');
  const page=await browser.newPage({viewport:desktop?{width:1440,height:1000}:{width:390,height:844}}),errors=[],submitted=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const agency={code:'TEST001',name:'테스트 기관',type:'agency'};
  const template={id:'template1',title:'검증 설문',scoringEnabled:false,questions:[
   {id:'q1',questionText:'단일',answerType:'single_choice',required:true,options:[{id:'a',optionText:'예',score:1}]},
   {id:'q2',questionText:'복수',answerType:'multiple_choice',required:false,options:[{id:'b',optionText:'선택',score:1},{id:'c',optionText:'기타',requiresText:true,score:0}]},
   {id:'q3',questionText:'단답',answerType:'text',required:true,options:[]},
   {id:'q4',questionText:'서술',answerType:'textarea',required:false,options:[]}
  ]};
  let fail=false;
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/institutions/TEST001')return route.fulfill({json:{agency}});
   if(url.pathname==='/api/intake/login')return route.fulfill({json:{agency,token:'synthetic-token'}});
   if(url.pathname==='/api/intake/checklist-templates')return route.fulfill({json:{templates:[template]}});
   if(url.pathname==='/api/intake/checklist-templates/template1')return route.fulfill({json:{template}});
   if(url.pathname==='/api/submissions'){submitted.push(route.request().postDataJSON());return route.fulfill({status:fail?500:201,json:fail?{message:'합성 오류'}:{id:'synthetic'}});}
   return route.fulfill({status:404,json:{}});
  });
  await page.goto(`http://127.0.0.1:${port}/landing`);
  await page.goto(`http://127.0.0.1:${port}/intake.html?agency=TEST001`);
  await page.locator('#workerAgencyPassword').fill('synthetic');await page.locator('#verifyAgencyPassword').click();
  await page.locator('#workerNameInput').fill('조사자');await page.locator('#workerPhoneInput').fill('01012345678');
  await page.locator('#sameAsWorker').check();assert.equal(await page.locator('#clientNameInput').inputValue(),'조사자');
  await page.locator('#workerNameInput').fill('김조사');assert.equal(await page.locator('#clientNameInput').inputValue(),'김조사');
  assert(await page.locator('#clientNameInput').evaluate(e=>e.readOnly));
  await page.locator('#sameAsWorker').uncheck();await page.locator('#clientNameInput').fill('이대상');
  await page.locator('[data-client-gender="여"]').click();await page.locator('#clientBirthYearInput').fill('1950');await page.locator('#clientBirthMonthInput').selectOption('02');await page.locator('#clientBirthDayInput').selectOption('03');
  const open=async()=>{await page.locator('[data-template-id="template1"]').click();await page.locator('#questionStep.is-active').waitFor();};
  const progress=async n=>assert.equal(await page.locator('#workerAnswerProgress').textContent(),`응답 ${n} / 전체 4문항`);
  await open();await progress(0);assert(await page.locator('.worker-score').isHidden());
  await page.locator('[data-option-id="a"]').click();await progress(1);
  await page.locator('[data-option-id="b"]').click();await progress(2);
  await page.locator('[data-option-id="c"].worker-option').click();await progress(1);
  await page.locator('.worker-option-extra-text').fill('추가 답변');await progress(2);
  await page.locator('[data-option-id="b"]').click();await progress(2);
  await page.locator('[data-option-id="c"].worker-option').click();await progress(1);
  await page.locator('[data-question-index="2"].worker-dynamic-text').fill('  ');await progress(1);
  await page.locator('[data-question-index="2"].worker-dynamic-text').fill('응답');await progress(2);
  await page.locator('[data-question-index="3"].worker-dynamic-text').fill('서술');await progress(3);
  await page.locator('#fieldMemo').fill('이전 메모');
  await page.evaluate(()=>window.scrollTo(0,500));
  const box=await page.locator('#workerAnswerProgress').boundingBox();assert(box.y>=0&&box.y+box.height<844,'progress stays visible on mobile scroll');
  await page.goBack();await page.locator('#selectStep.is-active').waitFor();assert(page.url().includes('intake.html'));
  assert.equal(await page.locator('#clientNameInput').inputValue(),'이대상');
  await page.goForward();await page.locator('#questionStep.is-active').waitFor();await progress(3);
  await page.locator('#backToSelect').click();await page.locator('#selectStep.is-active').waitFor();
  await page.locator('#resetClientInfo').click();
  for(const id of ['clientNameInput','clientGenderInput','clientBirthInput','clientBirthYearInput','clientBirthMonthInput','clientBirthDayInput','fieldMemo'])assert.equal(await page.locator('#'+id).inputValue(),'');
  assert.equal(await page.locator('.gender-choice[aria-checked="true"]').count(),0);assert(!await page.locator('#sameAsWorker').isChecked());
  assert.equal(await page.locator('#workerNameInput').inputValue(),'김조사');assert.equal(await page.locator('#workerPhoneInput').inputValue(),'010-1234-5678');
  await page.goForward();await page.locator('#selectStep.is-active').waitFor();assert(await page.locator('#questionStep').isHidden());
  await page.locator('#sameAsWorker').check();await page.locator('[data-client-gender="남"]').click();await page.locator('#clientBirthYearInput').fill('1980');await page.locator('#clientBirthMonthInput').selectOption('01');await page.locator('#clientBirthDayInput').selectOption('01');
  await open();await progress(0);await page.locator('[data-option-id="a"]').click();await page.locator('[data-question-index="2"].worker-dynamic-text').fill('새 답변');
  fail=true;await page.locator('#submitChecklist').click();await page.waitForFunction(()=>!document.querySelector('#submitChecklist').disabled);assert(await page.locator('#questionStep').isVisible());await progress(2);
  fail=false;await page.locator('#submitChecklist').click();await page.locator('#selectStep.is-active').waitFor();assert.equal(submitted.at(-1).clientName,'김조사');assert.equal(submitted.at(-1).fieldMemo,'');
  await page.goForward();await page.locator('#selectStep.is-active').waitFor();assert(await page.locator('#questionStep').isHidden());
  await page.locator('#resetClientInfo').click();assert.equal(await page.locator('#clientNameInput').inputValue(),'');assert(!await page.locator('#clientNameInput').evaluate(e=>e.readOnly));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,`outputs/intake-flow-${desktop?'desktop':'mobile'}.png`),fullPage:true});
  assert.deepEqual(errors,[]);console.log(`PASS Chrome ${desktop?'desktop':'mobile'}: internal back/forward, stale-answer guards, sticky answer count for all types, next-person reset, same investigator name sync, submission failure/success, no overflow or runtime errors.`);
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
