const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '../netlify/functions/api-legacy.cjs'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function fn(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
test('legacy plaintext password keys are removed without deleting unrelated settings', () => {
  const values = new Map([['lifeSafetyAgencyPassword:A','synthetic'],['lifeSafetyIntakePassword:B','synthetic'],['theme','dark'],['lifeSafetyAgencyPasswordUpdatedAt:A','date']]);
  const storage = {get length(){return values.size;}, key:i=>[...values.keys()][i], removeItem:k=>values.delete(k)};
  vm.runInNewContext(fn(app,'clearLegacyPasswords')+';clearLegacyPasswords();', {localStorage:storage,PASSWORD_STORAGE_PREFIX:'lifeSafetyAgencyPassword:',INTAKE_PASSWORD_STORAGE_PREFIX:'lifeSafetyIntakePassword:'});
  assert.deepEqual([...values.keys()], ['theme','lifeSafetyAgencyPasswordUpdatedAt:A']);
  assert.match(fn(app,'bootstrap'), /clearLegacyPasswords\(\)/);
  assert.match(fn(app,'logout'), /clearLegacyPasswords\(\)/);
});
test('password display and persistence helpers are removed, lifecycle clears inputs', () => {
  assert.doesNotMatch(app, /function (getAgencyPassword|setAgencyPassword|getIntakePassword|setIntakePassword)\(/);
  assert.doesNotMatch(app, /#(?:currentPassword|currentIntakePassword|centralCurrentPassword).*\.value/);
  for (const id of ['currentPassword','currentIntakePassword','centralCurrentPassword']) assert.match(html, new RegExp(`<p id="${id}">현재 비밀번호는 조회할 수 없습니다.</p>`));
  const fields = [{value:'synthetic'}, {value:'synthetic'}];
  vm.runInNewContext(fn(app,'clearPasswordFields')+';clearPasswordFields();',{document:{querySelectorAll:()=>fields}});
  assert.ok(fields.every(f=>f.value===''));
  for (const name of ['logout','activateView','closeInstitutionDialog']) assert.match(fn(app,name), /clearPasswordFields\(\)/);
});
test('missing or malformed CORS configuration never grants wildcard access', () => {
  for (const value of ['', '*', 'null','https://example.org/path','https://example.org/','https://user:secret@example.org','https://example.org\r\nX: bad']) {
    const result = vm.runInNewContext(fn(api,'corsHeaders')+';corsHeaders();',{process:{env:{ALLOWED_ORIGIN:value}},URL});
    assert.equal(Object.keys(result).length,0,value);
  }
});
test('CORS explicitly configured HTTPS or localhost origin is preserved on responses', () => {
  for (const value of ['https://example.org','http://localhost:8888']) {
    const result = vm.runInNewContext(fn(api,'corsHeaders')+fn(api,'response')+';response(401,{message:"fixture"});',{process:{env:{ALLOWED_ORIGIN:value}},URL});
    assert.equal(result.headers['Access-Control-Allow-Origin'],value);
    assert.equal(result.statusCode,401);
  }
});
test('AI streaming response uses the same restricted CORS policy', async () => {
  const wrapper = fs.readFileSync(path.join(__dirname, '../netlify/functions/api.mjs'), 'utf8');
  const c=vm.createContext({process:{env:{}},URL,TextEncoder,ReadableStream,Response,setInterval,clearInterval,Netlify:{env:{get:()=>undefined}}});
  vm.runInContext(fn(api,'corsHeaders'),c);
  c.legacyApi={corsHeaders:c.corsHeaders};
  vm.runInContext(fn(wrapper,'streamLegacyResponse'),c);
  const response=c.streamLegacyResponse(Promise.resolve({statusCode:200,body:'{}'}));
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  assert.match(await response.text(), /"result"/);
  c.Netlify.env.get=()=> 'https://example.org';
  const allowed=c.streamLegacyResponse(Promise.resolve({statusCode:200,body:'{}'}));
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'https://example.org');
  await allowed.text();
});
test('registration and bulk shared validator require eight-character intake passwords', () => {
  const c = vm.createContext({httpError:(statusCode,message)=>Object.assign(new Error(message),{statusCode})});
  vm.runInContext(fn(api,'newPassword'),c);
  for (const value of ['', '1234','1234567']) assert.throws(()=>c.newPassword(value,'fixture',8),e=>e.statusCode===400);
  assert.equal(c.newPassword('synthetic8','fixture',8),'synthetic8');
  assert.match(api,/newPassword\(body.intakePassword, "제출 페이지 초기 비밀번호", 8\)/);
  assert.match(html,/id="institutionIntakePassword"[^>]*minlength="8"/);
  assert.doesNotMatch(app,/next.length < 4/);
});
test('intake password change rejects short values before write and stores only hash/salt', async () => {
  const writes=[];
  const c=vm.createContext({assertCanManageInstitutionPassword:async()=>{},httpError:(statusCode,message)=>Object.assign(new Error(message),{statusCode}),crypto:require('node:crypto'),passwordHash:()=> 'synthetic-hash',supabase:async(p,o)=>{writes.push(JSON.parse(o.body));return [{}];},audit:async()=>{}});
  vm.runInContext(fn(api,'changeIntakePassword'),c);
  await assert.rejects(c.changeIntakePassword({agencyCode:'FIXTURE'},{password:'1234567'}),e=>e.statusCode===400);
  assert.equal(writes.length,0);
  const result=await c.changeIntakePassword({agencyCode:'FIXTURE'},{password:'synthetic8'});
  assert.equal(writes.length,1);
  assert.equal(writes[0].intake_password_hash,'synthetic-hash');
  assert.ok(!JSON.stringify({writes,result}).includes('synthetic8'));
});
