const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.SUPABASE_URL='https://fixture.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.NETLIFY_AUTH_SECRET='fixture';
const {handler}=require('../netlify/functions/api-legacy.cjs');
const id='11111111-1111-4111-8111-111111111111';
function event(path,body,role='central',scope='admin'){
 const p=Buffer.from(JSON.stringify({role,scope,agencyCode:'TESTAG',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
 return {httpMethod:'POST',rawUrl:`http://localhost/api${path}`,headers:{authorization:`Bearer ${p}.${crypto.createHmac('sha256','fixture').update(p).digest('base64url')}`},body:JSON.stringify(body)};
}
function fixture(enabled=true,status='active'){
 const writes=[];
 global.fetch=async(url,opts={})=>{
  const p=new URL(url).pathname,method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
  let rows=[];
  if(method==='GET'&&p.endsWith('/checklist_templates')) rows=[{id,title:'설정 설문',status,scoring_enabled:true,generation_method:'manual',management_enabled:enabled,management_bands:[{min:0,max:4,name:'일반'},{min:5,max:10,name:'관리'}]}];
  else if(method==='GET'&&p.endsWith('/institutions')) rows=[{code:'TESTAG',type:'agency',active:true}];
  else if(method==='GET'&&p.endsWith('/template_questions')) rows=[{id:1,question_no:1,question_text:'질문',required:true,answer_type:'single_choice'}];
  else if(method==='GET'&&p.endsWith('/question_options')) rows=[{id:10,question_id:1,option_text:'아니오',score:0,display_order:1},{id:11,question_id:1,option_text:'예',score:10,display_order:2}];
  else if(method==='POST'){writes.push({p,body});rows=[{id,...body}];}
  else throw Error(`Unexpected ${method} ${p}`);
  return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
 };
 return writes;
}
const submission={templateId:id,workerName:'테스트',workerPhone:'01000000000',clientName:'가상',clientGender:'남',clientBirth:'1950-01-01',answers:[{questionId:1,value:{optionIds:[11]},score:999}],totalScore:999,managementLabel:'조작'};
test('실제 제출 API는 서버 배점으로 계산하고 판정·기준 스냅샷·소속을 저장한다',async()=>{
 const writes=fixture();const res=await handler(event('/submissions',submission,'agency','intake'));
 assert.equal(res.statusCode,201,res.body);
 const saved=writes.find(w=>w.p.endsWith('/submissions')).body;
 assert.equal(saved.total_score,10);assert.equal(saved.management_label,'관리');assert.equal(saved.institution_code,'TESTAG');
 assert.equal(saved.template_snapshot.title,'설정 설문');assert.equal(saved.template_snapshot.questions.length,1);
 assert.equal(JSON.parse(res.body).submission.managementLabel,'관리');
});
test('관리구분 OFF 양식의 제출은 판정값을 저장하지 않는다',async()=>{
 const writes=fixture(false); const res=await handler(event('/submissions',submission,'agency','intake'));
 assert.equal(res.statusCode,201,res.body);assert.equal(writes.find(w=>w.p.endsWith('/submissions')).body.management_label,null);
});
test('종료된 양식과 구형 고정양식 제출은 새로 저장하지 않는다',async()=>{
 const writes=fixture(true,'closed');assert.equal((await handler(event('/submissions',submission,'agency','intake'))).statusCode,409);assert.equal(writes.length,0);
 assert.equal((await handler(event('/submissions',{...submission,templateId:null,checklistType:'fall'},'agency','intake'))).statusCode,409);
});
test('설문 저장 API가 잘못된 관리구간을 DB 쓰기 전에 차단한다',async()=>{
 const writes=fixture();const res=await handler(event('/checklist-templates',{title:'새 양식',scoringEnabled:true,managementEnabled:true,managementBands:[{min:0,max:5,name:'일반'}],questions:[{questionNo:1,questionText:'질문',required:true,answerType:'single_choice',options:[{optionText:'아니오',score:0},{optionText:'예',score:10}]}]}));
 assert.equal(res.statusCode,400,res.body);assert.equal(writes.length,0);
});
