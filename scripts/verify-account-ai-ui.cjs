'use strict';
// Headless production UI components + real account service, isolated DB/provider doubles.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {createAccountAI}=require('../netlify/functions/lib/account-ai');
process.env.AI_SETTINGS_ENCRYPTION_KEY=Buffer.alloc(32,17).toString('base64');
const rows=new Map();let providerCalls=0;
const api=createAccountAI({db:async(p,o={})=>{
 const b=o.body?JSON.parse(o.body):{};
 if(p.startsWith('agency_accounts?')||p.startsWith('institutions?'))return [{}];
 if(p.startsWith('account_ai_settings?'))return [rows.get(decodeURIComponent(p.match(/account_code=eq\.([^&]+)/)[1]))].filter(Boolean);
 if(p==='rpc/account_ai_take_attempt')return true;
 if(p==='rpc/account_ai_save'){
  if((rows.get(b.p_account_code)?.revision||0)!==b.p_expected_revision)throw Error('AI_REVISION_CONFLICT');
  const r={account_code:b.p_account_code,enabled:b.p_enabled,provider:b.p_provider,model:b.p_model,key_ciphertext:b.p_key_ciphertext,masked_key:b.p_masked_key,models:b.p_models,revision:b.p_expected_revision+1};rows.set(r.account_code,r);return [r];
 }throw Error(p);
},fetchImpl:async url=>{providerCalls++;return {ok:true,json:async()=>url.endsWith('/models')?{data:[{id:'gpt-4.1-mini'}]}:{output_text:'{"ok":true}'}};}});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const errors=[];
 try{
  for(const [code,role] of [['A','central'],['B','regional'],['C','agency']]){
   const page=await browser.newPage({viewport:{width:role==='agency'?390:1280,height:900}});
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   const token={scope:'admin',agencyCode:code,role};
   await page.exposeFunction('localApi',async(p,o={})=>{
    if(p==='/ai/settings')return o.method==='PATCH'?api.save(token,o.body):api.read(token);
    if(p==='/ai/settings/verify')return api.verify(token,o.body);
    if(p==='/checklist-templates/ai-status'){const c=await api.resolve(token);return {configured:Boolean(c),files:Boolean(c?.files)};}
    throw Error(p);
   });
   await page.setContent('<nav class="nav-tabs"></nav><main class="workspace"><footer class="v8-footer"></footer></main><button id="generateAiDraftButton">Generate</button><button id="generateAiFileDraftButton">File</button><p id="aiDraftStatus"></p><p id="aiFileDraftStatus"></p>');
   await page.evaluate(({code})=>{
    window.agency={code};window.isAuthenticated=()=>true;window.apiRequest=window.localApi;
    window.escapeMarkup=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.activateView=v=>document.dispatchEvent(new CustomEvent('workspace-view-changed',{detail:v}));
   },{code});
   for(const file of ['ai-settings-state.js','ai-connection.js','ai-status-workspace.js'])await page.addScriptTag({path:path.resolve('assets',file)});
   await page.locator('[data-view="ai-settings"]').click();
   await page.waitForFunction(()=>!document.querySelector('#start-ai').disabled);
   assert.equal(await page.locator('.ai-control-card').getAttribute('data-enabled'),'false');
   await page.evaluate(()=>document.dispatchEvent(new Event('account-ai-settings-changed')));
   await page.waitForFunction(()=>document.querySelector('#generateAiDraftButton').disabled);
   await page.locator('#start-ai').click();
   await page.locator('#ai-service').selectOption('openai');
   await page.locator('#ai-key-input').fill('synthetic-private-key-'+code);
   await page.locator('#ai-test-key').click();
   await page.waitForFunction(()=>document.querySelector('#ai-model').options.length===2);
   assert.equal(await page.locator('#ai-key-input').inputValue(),'');
   await page.locator('#ai-model').selectOption('gpt-4.1-mini');
   await page.locator('#ai-save-settings').click();
   await page.waitForFunction(()=>!document.querySelector('#ai-settings-dialog').open);
   await page.waitForFunction(()=>!document.querySelector('#generateAiDraftButton').disabled);
   assert.equal(await page.locator('.ai-control-card').getAttribute('data-enabled'),'true');
   assert.equal(rows.get(code).enabled,true);
   assert(!JSON.stringify(rows.get(code)).includes('synthetic-private-key'));
   await page.locator('#refresh-ai-readiness').click();
   await page.waitForFunction(()=>!document.querySelector('#refresh-ai-readiness').disabled);
   assert.equal(await page.locator('#ai-configured-model').textContent(),'gpt-4.1-mini');
   await page.locator('#stop-ai').click();
   await page.waitForFunction(()=>document.querySelector('#stop-ai').hidden);
   await page.waitForFunction(()=>document.querySelector('#generateAiDraftButton').disabled);
   assert(rows.get(code).key_ciphertext);
   await page.locator('#show-ai-settings').click();
   await page.locator('#ai-service').selectOption('google');
   assert.equal(await page.locator('#ai-file-support').isVisible(),true);
   await page.locator('#done-ai-settings').click();
   await page.locator('#show-ai-settings').click();
   assert.equal(await page.locator('#ai-service').inputValue(),'openai');
   await page.locator('#ai-delete-key').click();await page.locator('#ai-save-settings').click();
   await page.waitForFunction(()=>!document.querySelector('#ai-settings-dialog').open);
   assert.equal(rows.get(code).key_ciphertext,null);
   await page.close();
  }
  assert.deepEqual(errors,[]);assert.equal(providerCalls,6);
  console.log('PASS production UI components: three roles, mobile viewport, unset gating, verify/save, reload, stop, cancel, delete, encrypted storage; no real AI/DB calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
