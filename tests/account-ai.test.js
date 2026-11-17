const test=require('node:test'),assert=require('node:assert/strict');
const {createAccountAI,seal,unseal,complete,listModels}=require('../netlify/functions/lib/account-ai');
process.env.AI_SETTINGS_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
const token=(code='A',role='agency')=>({agencyCode:code,role,scope:'admin'});
function fixture(){
 const rows=new Map(),calls=[];let attempts=0,clock=1000,active=true,fail=false;
 const db=async(path,options={})=>{
  const body=options.body?JSON.parse(options.body):{};
  if(path.startsWith('agency_accounts?')||path.startsWith('institutions?'))return active?[{code:'active'}]:[];
  if(path.startsWith('account_ai_settings?')){const code=decodeURIComponent(path.match(/account_code=eq\.([^&]+)/)[1]);return rows.has(code)?[rows.get(code)]:[];}
  if(path==='rpc/account_ai_take_attempt')return ++attempts<=5;
  if(path==='rpc/account_ai_save'){
   const before=rows.get(body.p_account_code);if((before?.revision||0)!==body.p_expected_revision)throw Error('AI_REVISION_CONFLICT');
   const row={account_code:body.p_account_code,enabled:body.p_enabled,provider:body.p_provider,model:body.p_model,key_ciphertext:body.p_key_ciphertext,masked_key:body.p_masked_key,models:body.p_models,revision:body.p_expected_revision+1};rows.set(row.account_code,row);return [row];
  }throw Error(path);
 };
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});if(fail)return {ok:false,status:401,json:async()=>({error:{message:'secret-key-leak'}})};
  const data=url.endsWith('/models')?{data:[{id:'gpt-5.4-mini'},{id:'gpt-4.1-mini'},{id:'gpt-audio'},{id:'bad-model'}]}:{output_text:'{"ok":true}'};
  return {ok:true,json:async()=>data};
 };
 const api=createAccountAI({db,fetchImpl,now:()=>clock});
 async function draft(code='A'){
  const v=await api.verify(token(code),{provider:'openai',input:'test-secret-key-'+code});
  return {enabled:true,provider:'openai',model:'gpt-5.4-mini',revision:0,connections:{openai:v}};
 }
 return {api,rows,calls,draft,setClock:v=>clock=v,setActive:v=>active=v,setFail:v=>fail=v};
}
test('initial state is off for each admin role, never prefilled from env',async()=>{
 const f=fixture();for(const role of ['central','regional','agency']){const r=await f.api.read(token('A',role));assert.equal(r.canManage,true);assert.equal(r.state.enabled,false);assert.deepEqual(r.state.connections,{});}assert.equal(f.calls.length,0);
});
test('verify discovers supported models, encrypted handle then save probes chosen model',async()=>{
 const f=fixture(),d=await f.draft();assert.deepEqual(d.connections.openai.models,['gpt-4.1-mini','gpt-5.4-mini']);
 assert(!JSON.stringify(d).includes('test-secret-key'));
 const saved=await f.api.save(token(),d);assert.equal(saved.enabled,true);assert.equal(saved.revision,1);assert(!JSON.stringify(saved).includes('test-secret-key'));
 assert.equal((await f.api.resolve(token())).apiKey,'test-secret-key-A');assert.equal(f.calls.length,2);
 assert.equal(JSON.parse(f.calls[1].options.body).model,d.model);assert.equal(JSON.parse(f.calls[1].options.body).store,false);
 assert(!f.rows.get('A').key_ciphertext.includes('test-secret-key'));
});
test('account B cannot reuse A proof or saved handle',async()=>{
 const f=fixture(),d=await f.draft();await assert.rejects(f.api.save(token('B'),d),e=>e.statusCode===400);
 await f.api.save(token(),d);const saved=(await f.api.read(token())).state;saved.revision=0;
 await assert.rejects(f.api.save(token('B'),saved),e=>e.statusCode===400);assert.equal(await f.api.resolve(token('B')),null);
});
test('tampering, expiration and unverified model fail closed',async()=>{
 const f=fixture(),d=await f.draft();await assert.rejects(f.api.save(token(),{...d,model:'gpt-invented'}),e=>e.statusCode===400);
 const tampered=structuredClone(d);tampered.connections.openai.handle+='x';await assert.rejects(f.api.save(token(),tampered),e=>e.statusCode===400);
 f.setClock(700000);await assert.rejects(f.api.save(token(),d),e=>e.statusCode===400);assert.equal(f.rows.size,0);
});
test('stop keeps encrypted key; delete removes it; stale revision cannot restore key',async()=>{
 const f=fixture(),d=await f.draft();const saved=await f.api.save(token(),d);
 const stopped=await f.api.save(token(),{...saved,enabled:false});assert.equal(await f.api.resolve(token()),null);assert(f.rows.get('A').key_ciphertext);
 const cleared=await f.api.save(token(),{...stopped,connections:{}});assert.equal(cleared.enabled,false);assert.equal(f.rows.get('A').key_ciphertext,null);
 await assert.rejects(f.api.save(token(),saved),e=>e.statusCode===409);assert.equal(f.calls.length,2);
});
test('provider failure cannot overwrite applied settings; errors contain no key',async()=>{
 const f=fixture(),d=await f.draft();await f.api.save(token(),d);f.setFail(true);
 const state=(await f.api.read(token())).state;state.model='gpt-4.1-mini';
 await assert.rejects(f.api.save(token(),state),e=>e.statusCode===401&&!e.message.includes('secret-key-leak'));
 assert.equal(f.rows.get('A').model,'gpt-5.4-mini');assert.equal(f.rows.get('A').revision,1);
});
test('inactive and intake accounts are refused before provider use',async()=>{
 const f=fixture();await assert.rejects(f.api.read({...token(),scope:'intake'}),e=>e.statusCode===403);f.setActive(false);
 await assert.rejects(f.api.verify(token(),{provider:'openai',input:'test-key-long'}),e=>e.statusCode===403);assert.equal(f.calls.length,0);
});
test('rate limit prevents excess model discovery',async()=>{
 const f=fixture();for(let i=0;i<5;i++)await f.draft();await assert.rejects(f.draft(),e=>e.statusCode===429);assert.equal(f.calls.length,5);
});
test('encryption binds owner and purpose and uses unique nonces',()=>{
 const a=seal('A','stored',{key:'sensitive'}),b=seal('A','stored',{key:'sensitive'});assert.notEqual(a,b);
 assert.equal(unseal('A','stored',a).key,'sensitive');assert.throws(()=>unseal('B','stored',a));assert.throws(()=>unseal('A','verification',a));
});
test('missing encryption key is explicit and never falls back to auth secret',()=>{
 const saved=process.env.AI_SETTINGS_ENCRYPTION_KEY;delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
 try{assert.throws(()=>seal('A','stored',{}),e=>e.statusCode===503);}finally{process.env.AI_SETTINGS_ENCRYPTION_KEY=saved;}
});
test('fixed provider hosts, non-OpenAI file guard and no automatic fallback',async()=>{
 const calls=[];const fake=async(url,o)=>{calls.push({url,o});return {ok:true,json:async()=>url.includes('anthropic')?{content:[{type:'text',text:'{"ok":true}'}]}:{candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]}};};
 for(const [provider,model] of [['anthropic','claude-sonnet-test'],['google','gemini-test']]){
  const c={provider,model,apiKey:'test-key',baseUrl:'https://attacker.invalid'};
  assert.equal((await complete(c,{input:[{content:[{type:'input_text',text:'test'}]}]},fake)).output_text,'{"ok":true}');
  await assert.rejects(complete(c,{input:[{content:[{type:'input_file'}]}]},fake),e=>e.statusCode===400);
 }assert.equal(calls.length,2);assert(calls.every(c=>!c.url.includes('attacker')));
});
test('model discovery uses provider headers, filters unsupported modalities',async()=>{
 const google=await listModels('google','synthetic-key',async(url,o)=>{assert.equal(o.headers['x-goog-api-key'],'synthetic-key');assert(!url.includes('synthetic-key'));return {ok:true,json:async()=>({models:[{name:'models/gemini-test',supportedGenerationMethods:['generateContent']},{name:'models/gemini-image',supportedGenerationMethods:['generateContent']}]})};});
 assert.deepEqual(google,['gemini-test']);
});
