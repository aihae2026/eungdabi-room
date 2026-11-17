const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeManagement,scoreRange,classify}=require('../netlify/functions/lib/management');
const {legacyTemplates,buildSql}=require('../scripts/build-survey-transition.cjs');
const questions=[{answerType:'single_choice',required:true,options:[{score:0},{score:10}]}];
const valid={scoringEnabled:true,managementEnabled:true,managementBands:[{min:0,max:4,name:'일반'},{min:5,max:10,name:'관리'}]};
test('관리구분 OFF는 구간을 저장하거나 판정하지 않는다',()=>{
 assert.deepEqual(normalizeManagement({managementEnabled:false,managementBands:valid.managementBands},questions),{managementEnabled:false,managementBands:[]});
 assert.equal(classify({managementEnabled:false},5),null);
});
test('총점 관리구간 경계는 포함되며 서버가 판정한다',()=>{
 const t=normalizeManagement(valid,questions);
 assert.deepEqual([0,4,5,10].map(s=>classify(t,s)),['일반','일반','관리','관리']);
 assert.throws(()=>classify(t,11));
});
test('구간 누락·겹침·역전·소수·빈 값·중복 이름·점수 미사용 거부',()=>{
 for(const bands of [[{min:1,max:10,name:'A'}],[{min:0,max:5,name:'A'},{min:5,max:10,name:'B'}],[{min:0,max:4,name:'A'},{min:6,max:10,name:'B'}],[{min:10,max:0,name:'A'}],[{min:0,max:10.5,name:'A'}],[{min:null,max:10,name:'A'}],[{min:0,max:4,name:'A'},{min:5,max:10,name:'A'}]]) assert.throws(()=>normalizeManagement({...valid,managementBands:bands},questions));
 assert.throws(()=>normalizeManagement({...valid,scoringEnabled:false},questions));
 assert.throws(()=>normalizeManagement(valid,[{answerType:'text'}]));
});
test('음수·복수선택·필수/선택 문항의 총점 범위를 계산한다',()=>{
 assert.deepEqual(scoreRange([{answerType:'multiple_choice',required:true,options:[{score:-3},{score:2},{score:5}]}]),{min:-3,max:7});
 assert.deepEqual(scoreRange([{answerType:'single_choice',required:false,options:[{score:2},{score:5}]}]),{min:0,max:5});
});
test('기존 3종의 모든 가능한 총점에서 판정과 문항·배점을 유지한다',()=>{
 const templates=legacyTemplates(); assert.equal(templates.length,3);
 for(const t of templates) {
  const normalized=normalizeManagement(t,t.questions);
  for(let score=0;score<=scoreRange(t.questions).max;score++) {
   const expected=t.legacyType==='fall'?(score<=25?'저위험':score<60?'중위험':'고위험'):t.legacyType==='depression'?(score<=4?'우울아님':score<=9?'가벼운 우울':score<=19?'중간정도의 우울':'심한 우울'):(score<=5?'정상':'위험군');
   assert.equal(classify(normalized,score),expected);
  }
 }
 assert.deepEqual(templates.map(t=>t.questions.length),[20,9,14]);
});
test('DB 이관은 트랜잭션·데이터 보존 검사·권한 제한을 포함한다',()=>{
 const sql=buildSql(); assert.match(sql,/^begin;/);assert.match(sql,/commit;$/);assert.match(sql,/Submission preservation failed/);assert.match(sql,/Answer preservation failed/);assert.match(sql,/security invoker/);assert.match(sql,/s.management_label/);
});
