const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {accountResponse,settingsRow}=require('./support/account-ai-fixture');
process.env.SUPABASE_URL='https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only';
process.env.NETLIFY_AUTH_SECRET='fixture-only';
const {handler}=require('../netlify/functions/api-legacy.cjs');
function request(role,scope='admin'){
 const payload=Buffer.from(JSON.stringify({scope,role,agencyCode:'FIXTURECENTRAL',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 const signature=crypto.createHmac('sha256',process.env.NETLIFY_AUTH_SECRET).update(payload).digest('base64url');
 return {httpMethod:'GET',rawUrl:'http://localhost/api/checklist-templates/ai-status',headers:{authorization:`Bearer ${payload}.${signature}`}};
}
test('account readiness reads private settings without provider call or secret exposure',async()=>{
 const row=settingsRow('FIXTURECENTRAL');
 global.fetch=async url=>{const result=accountResponse(url,row);if(result)return result;throw Error('Provider request prohibited');};
 for(const role of ['central','regional','agency']){
  const result=await handler(request(role));assert.equal(result.statusCode,200);
  const data=JSON.parse(result.body);assert.equal(data.configured,true);assert.equal(data.connectionVerified,true);
  assert.equal(data.model,row.model);assert.equal(data.files,true);
  assert.doesNotMatch(result.body,/account-key-test|key_ciphertext|apiKey|baseUrl/);
 }
});
test('missing account settings never fall back to project AI credentials',async()=>{
 process.env.OPENAI_API_KEY='project-key';process.env.OPENAI_BASE_URL='https://gateway.invalid';
 global.fetch=async url=>{const result=accountResponse(url);if(result)return result;throw Error('Provider request prohibited');};
 const result=await handler(request('central'));assert.equal(result.statusCode,200);assert.equal(JSON.parse(result.body).configured,false);
});
test('intake cannot read account AI readiness',async()=>{
 global.fetch=async()=>{throw Error('No fetch');};
 assert.equal((await handler(request('agency','intake'))).statusCode,403);
});
