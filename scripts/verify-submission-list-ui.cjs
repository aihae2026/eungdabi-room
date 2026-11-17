'use strict';
// Actual local admin UI in Chrome; only synthetic API fixtures, no production writes.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=8964;
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port),'--admin-ux'],{cwd:root,stdio:['ignore','pipe','pipe']});
const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.on('data',s=>{if(String(s).includes('localhost:')){clearTimeout(timer);resolve();}});server.on('error',reject);});
(async()=>{
 let browser;
 try {
  await ready;browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({timezoneId:'America/Los_Angeles',viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(10000);const errors=[],requests=[],exports=[],details=[];page.on('pageerror',e=>errors.push(e.message));
  const tid='22222222-2222-4222-8222-222222222222';
  const rows=Array.from({length:45},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,agencyCode:'MOCKAG001',institutionName:'검증 기관',templateId:tid,checklistTitle:'검증 설문',templateGenerationMethod:'manual',scoringEnabled:true,totalScore:3,maxScore:10,managementLabel:i?'관리':null,submittedAt:'2026-09-15T15:00:00Z',workerName:'검증 조사자',workerPhone:'01000000000',clientGender:'남',clientBirth:'1950-01-01',clientId:'1234567',status:'확인 대기',answers:[{questionNo:1,questionText:'검증 질문',answerLabel:'답변',score:3}]}));
  rows.forEach((row,i)=>{row.clientName=i===1?'':i===0?'검증 <대상자>':'검증 대상자';});
  let fail=false,failExport=false,release,hold=false;
  await page.route('**/api/stats/templates',r=>r.fulfill({json:{templates:[{id:tid,title:'검증 설문',generationMethod:'manual',status:'active'}]}}));
  await page.route('**/api/submissions**',async r=>{
   const url=new URL(r.request().url());
   if(url.pathname==='/api/submissions/export-details'){details.push(r.request().postDataJSON());return r.fulfill({json:{rows:rows.filter(x=>details.at(-1).ids.includes(x.id))}});}
   if(url.pathname==='/api/submissions/export'){exports.push(url.searchParams.toString());return r.fulfill({status:failExport?500:200,json:failExport?{message:'합성 Excel 조회 실패'}:{rows,totalCount:45}});}
   if(url.pathname!=='/api/submissions')return r.continue();
   const query=Object.fromEntries(url.searchParams);requests.push(query);
   if(hold){hold=false;await new Promise(resolve=>release=resolve);}
   if(fail)return r.fulfill({status:500,json:{message:'합성 조회 실패'}});
   const p=Number(query.page||1),limit=20;
   return r.fulfill({json:{rows:rows.slice((p-1)*limit,p*limit),pagination:{page:p,limit,totalCount:45,totalPages:3,start:(p-1)*limit+1,end:Math.min(p*limit,45)}}});
  });
  await page.goto(`http://127.0.0.1:${port}/admin`);
  await page.locator('#loginId').fill('MOCKCENTRAL');await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
  await page.locator('.nav-tab[data-view="dashboard"]').click();
  assert.equal(await page.locator('#submissionQueryNotice').count(),0);
  assert.equal(await page.locator('#v8PageDescription').isVisible(),false);
  assert.equal(await page.locator('#view-dashboard th').nth(4).innerText(),'제출일시');
  for (const width of [2560,1440]) {
    await page.setViewportSize({width,height:1000});
    const searchBox=await page.locator('#searchInput').boundingBox();
    const surveyBox=await page.locator('#filterType').boundingBox();
    assert(surveyBox.y >= searchBox.y+searchBox.height, `survey starts a new row at ${width}px`);
  }
  await page.locator('.nav-tab[data-view="home"]').click();
  assert.equal(await page.locator('#v8PageDescription').isVisible(),true);
  await page.locator('.nav-tab[data-view="dashboard"]').click();
  await page.locator(`#filterType option[value="template:${tid}"]`).waitFor({state:'attached'});
  assert.equal(requests.length,0);assert.equal(await page.locator('#v8ExportCsv').count(),0);assert(await page.locator('#exportDetailedExcel').isDisabled());
  await page.locator('#filterType').selectOption('template:'+tid);await page.locator('#filterStartDate').fill('2026-09-16');await page.locator('#filterEndDate').fill('2026-09-16');await page.locator('#searchInput').fill('검증');
  await page.waitForTimeout(400);assert.equal(requests.length,0);
  await page.locator('#v8QuerySubmissions').click();await page.waitForFunction(()=>submissionsLoaded&&!submissionsLoading);
  assert.equal(requests.length,1);assert.equal(requests[0].startDate,'2026-09-16');assert(await page.locator('#exportDetailedExcel').isEnabled());
  assert.equal(await page.locator('#view-dashboard th').count(),11);
  const cells=await page.locator('#submissionRows tr').first().locator('td').allTextContents();
  const subjectCell=page.locator('#submissionRows tr').first().locator('td').nth(6);
  assert.equal(await subjectCell.textContent(),'검증 <대상자>남 · 1950-01-01');
  assert.equal(await subjectCell.locator('small').textContent(),'남 · 1950-01-01');
  assert.equal(await subjectCell.locator('대상자').count(),0);
  assert.equal(await page.locator('#submissionRows tr').nth(1).locator('td').nth(6).textContent(),'—남 · 1950-01-01');
  assert.equal(cells[1],'1');assert.equal(cells[2],'가상수행기관 001');assert.equal(cells[3],'검증 설문');assert.equal(cells[4],'2026-09-16 00:00:00');assert.match(cells[5],/01000000000/);assert.match(cells[6],/1950-01-01/);assert.equal(cells[7],'1234567');assert.match(cells[8],/3 \/ 10/);
  await page.locator('#searchInput').fill('미적용 조건');assert(await page.locator('#exportDetailedExcel').isDisabled());assert.equal(requests.length,1);
  await page.locator('[data-page="2"]').click();await page.waitForFunction(()=>!submissionsLoading&&currentPage===2);
  assert.equal(requests.at(-1).search,'검증');assert.equal(await page.locator('#submissionRows tr').first().locator('td').nth(1).innerText(),'21');
  const listDownload=page.waitForEvent('download');await page.locator('#exportExcel').click();await listDownload;assert.match(exports.at(-1),/search=/);assert.equal(new URLSearchParams(exports.at(-1)).get('search'),'검증');
  await page.locator('#v8QuerySubmissions').click();await page.waitForFunction(()=>!submissionsLoading&&currentPage===1);
  const detailedDownload=page.waitForEvent('download');await page.locator('#exportDetailedExcel').click();await detailedDownload;await page.waitForFunction(()=>!submissionDetailsExporting);
  assert.equal(details.at(-1).templateId,tid);assert.equal(details.at(-1).ids.length,45);
  failExport=true;await page.locator('#exportDetailedExcel').click();await page.waitForFunction(()=>!submissionDetailsExporting);assert.match(await page.locator('#toast').innerText(),/합성 Excel 조회 실패/);failExport=false;
  await page.locator('#filterStartDate').fill('2026-09-17');const before=requests.length;await page.locator('#v8QuerySubmissions').click();assert.equal(requests.length,before);assert.match(await page.locator('#toast').innerText(),/시작일자/);
  await page.locator('#v8ResetSubmissions').click();assert.equal(requests.length,before);assert(await page.locator('#exportDetailedExcel').isDisabled());
  fail=true;await page.locator('#v8QuerySubmissions').click();await page.waitForFunction(()=>Boolean(submissionsError));assert(await page.locator('#exportExcel').isDisabled());assert.match(await page.locator('#submissionRows').innerText(),/조회 실패/);
  fail=false;await page.locator('[data-retry-submissions]').click();await page.waitForFunction(()=>!submissionsLoading&&!submissionsError);assert(await page.locator('#exportDetailedExcel').isDisabled());
  hold=true;await page.locator('#searchInput').fill('먼저');await page.locator('#v8QuerySubmissions').click();await page.waitForFunction(()=>submissionsLoading);while(!release)await new Promise(r=>setTimeout(r,10));
  await page.locator('#searchInput').fill('나중');await page.locator('#v8QuerySubmissions').click();await page.waitForFunction(()=>!submissionsLoading);release();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>appliedSubmissionFilters.search),'나중');
  await page.screenshot({path:path.join(root,'outputs/submission-list-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS Chrome: manual query/reset, pending vs applied pagination/export, 11 columns, KST in foreign timezone, Excel downloads/guards/errors, invalid dates, retry, request races, mobile containment; no JS errors.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
