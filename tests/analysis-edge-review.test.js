const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic';
process.env.NETLIFY_AUTH_SECRET = 'synthetic-review';
const {handler} = require('../netlify/functions/api-legacy.cjs');
const {computeCrosstab} = require('../netlify/functions/lib/crosstab.js');
const badDimensions = [
  {kind:'unsupported'}, {kind:'attribute',field:'answers'},
  {kind:'number_bins',field:'invalid',boundaries:[]},
  {kind:'number_bins',field:'score',boundaries:'30'},
  {kind:'number_bins',field:'score',boundaries:[null]},
  {kind:'number_bins',field:'score',boundaries:[1.5]},
  {kind:'number_bins',field:'score',boundaries:[30],labels:['같음',' 같음 ']},
  {kind:'number_bins',field:'score',boundaries:[30],labels:['','높음']},
  {kind:'number_bins',field:'score',boundaries:[30],labels:['하나']},
  {kind:'number_bins',field:'score',boundaries:[30],labels:'낮음'},
  {kind:'question',questionNo:0}, {kind:'question',questionNo:1.5},
  {kind:'attribute',field:'gender',labels:['여','여']},
];
test('잘못된 유형·필드·배열·구간명·문항번호는 DB 조회 전에 400으로 거부한다', async () => {
  const payload=Buffer.from(JSON.stringify({scope:'admin',role:'central',agencyCode:'TEST',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const signature=crypto.createHmac('sha256',process.env.NETLIFY_AUTH_SECRET).update(payload).digest('base64url');
  const oldFetch=global.fetch; let calls=0;
  global.fetch=async()=>{calls++;throw Error('DB must not be called');};
  try {
    const specs=badDimensions.map(row=>({row,col:{kind:'all'}}));
    specs.push({row:{kind:'all'},col:{kind:'all'},cells:['unsupported']});
    specs.push({row:{kind:'all'},col:{kind:'all'},cells:'count'});
    for(const spec of specs) {
      const response=await handler({httpMethod:'POST',rawUrl:'http://localhost/api/analysis/run',headers:{authorization:`Bearer ${payload}.${signature}`},body:JSON.stringify({checklistType:'fall',specs:[spec]})});
      assert.equal(response.statusCode,400,JSON.stringify(spec));
      assert.throws(()=>computeCrosstab([],spec));
    }
    assert.equal(calls,0);
  } finally {global.fetch=oldFetch;}
});
test('구간명 공백 제거 후 건수·합계·비율은 보존한다',()=>{
  const result=computeCrosstab([{score:10},{score:40}],{row:{kind:'all'},col:{kind:'number_bins',field:'score',boundaries:[30],labels:[' 낮음 ',' 높음 ']},cells:['count','pct','mean']});
  assert.deepEqual(result.colLabels,['낮음','높음']);
  assert.deepEqual(result.colTotals,[1,1]); assert.equal(result.grandTotal,2);
  assert.deepEqual(result.cells[0],[{count:1,pct:50,mean:10},{count:1,pct:50,mean:40}]);
});
test('알 수 없는 분석 차원은 서버 오류 대신 요청 오류로 거부해야 한다', async () => {
  const payload = Buffer.from(JSON.stringify({scope:'admin',role:'central',agencyCode:'TEST',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const signature = crypto.createHmac('sha256',process.env.NETLIFY_AUTH_SECRET).update(payload).digest('base64url');
  const oldFetch = global.fetch;
  global.fetch = async () => ({ok:true,status:200,text:async()=> '[]'});
  try {
    const response = await handler({httpMethod:'POST',rawUrl:'http://localhost/api/analysis/run',headers:{authorization:`Bearer ${payload}.${signature}`},body:JSON.stringify({checklistType:'fall',specs:[{row:{kind:'unsupported'},col:{kind:'all'}}]})});
    assert.equal(response.statusCode,400);
  } finally { global.fetch = oldFetch; }
});
test('중복 구간명은 거부하거나 서로 다른 점수 구간을 구별해야 한다', () => {
  let result;
  try {
    result = computeCrosstab([{score:10},{score:40}], {row:{kind:'number_bins',field:'score',boundaries:[30],labels:['동일','동일']},col:{kind:'all'}});
  } catch { return; }
  assert.deepEqual(result.rowTotals,[1,1]);
});
