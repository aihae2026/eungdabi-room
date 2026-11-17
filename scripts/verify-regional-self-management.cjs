// Synthetic local browser checks only; no production writes.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),port=8982;
const server=spawn(process.execPath,[path.join(__dirname,'dev-mock-server.js'),String(port),'--admin-ux'],{cwd:root,stdio:['ignore','pipe','pipe']});
(async()=>{
 let browser;
 try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('server timeout')),10000);server.stdout.on('data',s=>{if(String(s).includes('localhost:')){clearTimeout(t);resolve();}});server.on('error',reject);});
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(10000);
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  let ownName;
  await page.route('**/api/institutions',async r=>{
    const response=await r.fetch(), data=await response.json();
    if(ownName) data.institutions.forEach(o=>{if(o.code==='MOCKREGION1')o.name=ownName;});
    await r.fulfill({json:data});
  });
  await page.route('**/api/institutions/MOCKREGION1',r=>{
    const body=r.request().postDataJSON();ownName=body.name;
    return r.fulfill({json:{institution:{code:'MOCKREGION1',name:ownName}}});
  });
  await page.route('**/api/password',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:{account:{passwordUpdatedAt:new Date().toISOString()}}});});
  await page.goto(`http://127.0.0.1:${port}/admin`);
  await page.locator('#loginId').fill('MOCKREGION1');await page.locator('#loginPassword').fill('mock1234');await page.locator('#loginSubmitButton').click();
  await page.locator('.nav-tab[data-view="master"]').click();
  await page.locator('[data-v8-institution-open]').click();
  assert.equal(await page.locator('#agencyCode').inputValue(),'MOCKREGION1');
  await page.locator('[data-v8-edit-org]').click();
  assert.equal(await page.locator('#institutionCode').inputValue(),'MOCKREGION1');
  assert.equal(await page.locator('#institutionName').isEditable(),true);
  assert.equal(await page.locator('#institutionSido').isEditable(),false);
  await page.locator('#institutionName').fill('수정한 광역기관');
  await page.locator('#saveInstitutionButton').click();
  await page.waitForFunction(()=>!document.querySelector('#institutionDialog').open);
  assert.equal(await page.locator('#v8InstitutionTitle').innerText(),'수정한 광역기관');
  await page.locator('[data-v8-institution-tab="2"]').click();
  await page.locator('#newPassword').fill('synthetic1234');await page.locator('#confirmPassword').fill('synthetic1234');await page.locator('#savePassword').click();
  await page.waitForFunction(()=>document.querySelector('#newPassword').value==='');
  assert.equal(writes[0].institutionCode,'MOCKREGION1');
  await page.locator('#v8CloseInstitution').click();
  await page.locator('[data-master-agency-code="MOCKAG001"]').click();
  assert.equal(await page.locator('#agencyCode').inputValue(),'MOCKAG001');
  await page.locator('[data-v8-edit-org]').click();
  assert.equal(await page.locator('#institutionSido').isEditable(),false);
  assert.equal(await page.locator('#institutionSigungu').isEditable(),true);
  await page.locator('#cancelInstitutionDialog').click();await page.locator('#v8CloseInstitution').click();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-v8-institution-open]').click();
  assert.equal(await page.locator('#agencyCode').inputValue(),'MOCKREGION1');
  assert.deepEqual(errors,[]);
  console.log('PASS regional self name editor, own password target, child switching, readonly child sido, mobile own entry; no JS errors');
 } finally {await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
