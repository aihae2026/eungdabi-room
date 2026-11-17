const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.NETLIFY_AUTH_SECRET='fixture';
const {handler}=require('../netlify/functions/api-legacy.cjs');
const id='11111111-1111-4111-8111-111111111111';
function event(action,body={},role='agency',scope='admin'){
 const p=Buffer.from(JSON.stringify({role,scope,agencyCode:'A',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return {httpMethod:'PATCH',rawUrl:`http://localhost/api/submissions/${id}${action?'/'+action:''}`,headers:{authorization:`Bearer ${p}.${crypto.createHmac('sha256','fixture').update(p).digest('base64url')}`},body:JSON.stringify(body)};
}
function fixture({missing=false,race=false}={}){
 const state={row:{id,institution_code:'A',status:'확인 완료',client_id:'기관-A/2026 한글 001',completed_at:'2026-09-01T00:00:00Z',completed_by:'A'},writes:[],audit:[]};
 global.fetch=async(url,opts={})=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;let rows;
  if(u.pathname.endsWith('/audit_logs')){state.audit.push(body);rows=[];}
  else if(opts.method==='PATCH'){state.writes.push({query:u.searchParams,body});if(!race)Object.assign(state.row,body);rows=race?[]:[state.row];}
  else rows=missing?[]:[state.row];
  return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
 };return state;
}
test('관리번호 없이 확인 완료할 수 있고 완료자·시각을 기록한다',async()=>{
 const s=fixture();s.row.status='확인 대기';s.row.client_id=null;
 const r=await handler(event('complete',{clientId:''}));assert.equal(r.statusCode,200,r.body);assert.equal(s.row.client_id,null);assert.equal(s.row.status,'확인 완료');assert.equal(s.row.completed_by,'A');assert.match(s.row.completed_at,/T/);
});
test('관리번호의 한글·영문·특수문자·긴 번호를 변환 없이 저장한다',async()=>{
 for(const clientId of ['기관-A/2026 000123456789','001','H*****1234567','<기관 & "번호">']){
  const s=fixture();const r=await handler(event('complete',{clientId}));assert.equal(r.statusCode,200,r.body);assert.equal(s.row.client_id,clientId);
 }
});
test('확인 대기 복귀는 번호와 응답을 보존하고 완료 메타데이터만 비운다',async()=>{
 const s=fixture();const original=s.row.client_id;const r=await handler(event('reopen'));
 assert.equal(r.statusCode,200,r.body);assert.equal(s.row.status,'확인 대기');assert.equal(s.row.client_id,original);assert.equal(s.row.completed_at,null);assert.equal(s.row.completed_by,null);
 assert.equal(s.audit[0].action,'reopen_submission');assert.equal(s.audit[0].before_data.status,'확인 완료');
 assert(!Object.hasOwn(s.writes[0].body,'submission_answers'));assert.equal(s.writes[0].query.get('institution_code'),'eq.A');assert.equal(s.writes[0].query.get('deleted_at'),'is.null');assert.equal(s.writes[0].query.get('status'),'eq.확인 완료');
});
test('기본 정보 저장도 관리번호 형식을 제한하지 않고 공란을 허용한다',async()=>{
 for(const clientId of ['기관-001/2026','']){
  const s=fixture();const r=await handler(event('',{clientId,workerName:'김수진',workerPhone:'010-1234-5678',clientName:'홍길동',clientGender:'남',clientBirth:'1950-01-01'}));assert.equal(r.statusCode,200,r.body);assert.equal(s.row.client_id,clientId||null);assert.equal(s.row.status,'확인 완료');
 }
});
test('중앙·그룹·조사자에게 상태 변경 권한을 새로 부여하지 않는다',async()=>{
 global.fetch=async()=>{throw Error('DB must not run');};
 for(const action of ['complete','reopen'])for(const [role,scope] of [['central','admin'],['regional','admin'],['agency','intake']])assert.equal((await handler(event(action,{},role,scope))).statusCode,403);
});
test('다른 기관/삭제 제출과 상태 변경 경합은 성공으로 표시하지 않는다',async()=>{
 for(const action of ['complete','reopen']){
  let s=fixture({missing:true});assert.equal((await handler(event(action))).statusCode,404);assert.equal(s.writes.length,0);
  s=fixture({race:true});assert.equal((await handler(event(action))).statusCode,409);assert.equal(s.audit.length,0);
 }
});
