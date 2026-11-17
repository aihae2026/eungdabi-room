'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {normalizeTargets,allows,readTargets}=require('../netlify/functions/lib/template-targets.cjs');
process.env.SUPABASE_URL='https://targets.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.NETLIFY_AUTH_SECRET='targets-test';
const {handler}=require('../netlify/functions/api-legacy.cjs');
const id='11111111-1111-4111-8111-111111111111';
const institutions=[{code:'C',type:'central',active:true},{code:'R1',type:'regional',active:true},{code:'A1',type:'agency',active:true,parent_code:'R1'},{code:'A2',type:'agency',active:true,parent_code:'R2'},{code:'OFF',type:'agency',active:false}];
function event(method,path,body,role='central',scope='admin',code='C') {
 const p=Buffer.from(JSON.stringify({role,scope,agencyCode:code,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return {httpMethod:method,rawUrl:'http://localhost/api'+path,headers:{authorization:`Bearer ${p}.${crypto.createHmac('sha256','targets-test').update(p).digest('base64url')}`},body:body===undefined?null:JSON.stringify(body)};
}
function fixture(mode='all',codes=[],status='active') {
 const row={id,title:'기관 지정 양식',status,scoring_enabled:false,submission_target_mode:mode,submission_target_codes:codes,submission_target_revision:0};
 const writes=[],reads=[];
 global.fetch=async(url,opts={})=>{
  const u=new URL(url),p=u.pathname.split('/').pop(),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;let rows=[];
  if(method==='GET') {
   reads.push(u);
   if(p==='institutions') {
    const code=u.searchParams.get('code');rows=institutions.filter(r=>!code||code===`eq.${r.code}`||code.startsWith('in.')&&code.slice(4,-1).split(',').includes(r.code));
   } else if(p==='checklist_templates')rows=[{...row}];
   else if(p==='template_questions')rows=[{id:1,question_no:1,question_text:'질문',answer_type:'text',required:false}];
   else if(p==='question_options')rows=[];
   else throw Error(`Unexpected read ${url}`);
  } else {
   writes.push({p,method,body});
   if(p==='checklist_templates'){
    const expected=u.searchParams.get('submission_target_revision');
    if(expected&&expected!==`eq.${row.submission_target_revision}`)rows=[];
    else {if(body.submission_target_mode!==row.submission_target_mode||JSON.stringify(body.submission_target_codes)!==JSON.stringify(row.submission_target_codes))row.submission_target_revision++;Object.assign(row,body);rows=[{...row}];}
   }else rows=[{id,...body}];
  }
  return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
 };
 return {row,writes,reads};
}
const input={mode:'selected',codes:['A1'],revision:0};
test('전체 대상은 신규 기관도 포함하며 선택 대상·비활성·비기관은 제외한다',()=>{
 assert(allows(readTargets({}),institutions[2]));assert(allows(readTargets({}),{code:'NEW',type:'agency',active:true}));
 assert(!allows(input,institutions[3]));assert(!allows({mode:'all'},institutions[4]));assert(!allows({mode:'all'},institutions[1]));assert(!allows({mode:'broken',codes:[]},institutions[2]));
});
test('대상 형식·빈 선택·범위·오래된 버전 검증',async()=>{
 for(const bad of [null,{mode:'selected',codes:[],revision:0},{mode:'all',codes:['A1'],revision:0},{mode:'selected',codes:['X'],revision:0},{...input,revision:8},{...input,codes:['R1']},{...input,codes:['OFF']},{...input,codes:['A1),code.eq.C'] }]) {
  await assert.rejects(normalizeTargets(bad,async()=>institutions));
 }
 assert.deepEqual((await normalizeTargets({...input,codes:['A2','A1','A1']},async()=>institutions)).codes,['A1','A2']);
});
test('기존 비활성 선택은 보존 가능하지만 실제 제출은 불가',async()=>{
 const target={mode:'selected',codes:['OFF'],revision:1};
 assert.deepEqual(await normalizeTargets(target,async()=>institutions,target),target);
 assert(!allows(target,institutions[4]));
});
test('중앙관리자 외 대상 저장·기관 후보 목록 요청은 DB 호출 전에 거부',async()=>{
 global.fetch=async()=>{throw Error('Must not access DB');};
 for(const [role,scope] of [['regional','admin'],['agency','admin'],['agency','intake']]) {
  assert.equal((await handler(event('PATCH',`/checklist-templates/${id}/targets`,{submissionTargets:input},role,scope))).statusCode,403);
  assert.equal((await handler(event('GET','/checklist-target-institutions',undefined,role,scope))).statusCode,403);
 }
});
test('운영 중 대상만 수정하고 문항·제출 이력은 쓰지 않는다',async()=>{
 const f=fixture();const res=await handler(event('PATCH',`/checklist-templates/${id}/targets`,{submissionTargets:input,questions:[],status:'closed'}));
 assert.equal(res.statusCode,200,res.body);assert.equal(f.row.status,'active');assert.deepEqual(f.row.submission_target_codes,['A1']);
 assert.equal(JSON.parse(res.body).submissionTargets.revision,1);
 assert(f.writes.every(w=>['checklist_templates','audit_logs'].includes(w.p)));
 assert.equal((await handler(event('PATCH',`/checklist-templates/${id}/targets`,{submissionTargets:input}))).statusCode,409);
});
test('종료 양식 및 빈 선택은 수정하지 않는다',async()=>{
 const f=fixture('all',[],'closed');assert.equal((await handler(event('PATCH',`/checklist-templates/${id}/targets`,{submissionTargets:input}))).statusCode,409);assert.equal(f.writes.length,0);
 f.row.status='active';assert.equal((await handler(event('PATCH',`/checklist-templates/${id}/targets`,{submissionTargets:{...input,codes:[]}}))).statusCode,400);assert.equal(f.writes.length,0);
});
test('기관별 목록 조회는 DB에 대상 필터를 전달한다',async()=>{
 const f=fixture();const res=await handler(event('GET','/intake/checklist-templates',undefined,'agency','intake','A1'));
 assert.equal(res.statusCode,200,res.body);const url=f.reads.find(u=>u.pathname.endsWith('checklist_templates'));
 assert.match(url.searchParams.get('or'),/submission_target_mode.eq.all/);assert.match(url.searchParams.get('or'),/submission_target_codes.cs.\{A1\}/);
});
test('대상 외 기관의 양식 상세·직접 제출과 위조 기관코드를 거부',async()=>{
 const f=fixture('selected',['A1']);
 for(const path of [`/intake/checklist-templates/${id}`,'/submissions']) {
  const res=await handler(event(path==='/submissions'?'POST':'GET',path,{templateId:id,agencyCode:'A1',institutionCode:'A1',answers:[]},'agency','intake','A2'));
  assert.equal(res.statusCode,403,res.body);
 }
 assert.equal(f.writes.length,0);
});
test('기관을 제외하면 이미 열어둔 양식의 제출도 거부',async()=>{
 const f=fixture('selected',['A1']);assert.equal((await handler(event('GET',`/intake/checklist-templates/${id}`,undefined,'agency','intake','A1'))).statusCode,200);
 f.row.submission_target_codes=['A2'];assert.equal((await handler(event('POST','/submissions',{templateId:id,answers:[]},'agency','intake','A1'))).statusCode,403);assert.equal(f.writes.length,0);
});
test('허용 기관 제출은 세션 기관으로 귀속되고 기관 목록은 노출하지 않는다',async()=>{
 const f=fixture('selected',['A1']);
 const detail=await handler(event('GET',`/intake/checklist-templates/${id}`,undefined,'agency','intake','A1'));assert.equal(JSON.parse(detail.body).template.submissionTargets,undefined);
 const res=await handler(event('POST','/submissions',{templateId:id,answers:[],workerName:'가상',workerPhone:'010-0000-0000',clientName:'가상',clientGender:'남',clientBirth:'1950-01-01',institutionCode:'A2'},'agency','intake','A1'));
 assert.equal(res.statusCode,201,res.body);assert.equal(f.writes.find(w=>w.p==='submissions').body.institution_code,'A1');
});
const draft={title:'신규 지정 양식',scoringEnabled:false,questions:[{questionNo:1,questionText:'질문',answerType:'text',required:false,options:[]}]};
test('신규 작성·AI 초안 저장도 같은 기관 대상 설정을 저장한다',async()=>{
 for(const generationMethod of ['manual','ai_text','ai_file']) {
  const f=fixture();const result=await handler(event('POST','/checklist-templates',{...draft,generationMethod,submissionTargets:input}));
  assert.equal(result.statusCode,201,result.body);assert.deepEqual(f.row.submission_target_codes,['A1']);assert.equal(f.row.submission_target_mode,'selected');
 }
});
test('복사본은 선택 기관을 보존하며 전체 기관으로 확대하지 않는다',async()=>{
 const f=fixture('selected',['A1']);const result=await handler(event('POST',`/checklist-templates/${id}/copy`,{title:'복사본'}));
 assert.equal(result.statusCode,201,result.body);assert.equal(f.row.submission_target_mode,'selected');assert.deepEqual(f.row.submission_target_codes,['A1']);assert.equal(f.row.copied_from_id,id);
});
test('대상 설정을 생략한 구형 클라이언트의 초안 수정은 기존 대상을 보존한다',async()=>{
 const f=fixture('selected',['A1'],'draft');const result=await handler(event('PATCH',`/checklist-templates/${id}`,draft));
 assert.equal(result.statusCode,200,result.body);assert.deepEqual(f.row.submission_target_codes,['A1']);
});
