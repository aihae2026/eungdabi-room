const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
process.env.SUPABASE_URL = 'https://fixture.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
process.env.NETLIFY_AUTH_SECRET = 'fixture';
const {handler} = require('../netlify/functions/api-legacy.cjs');
const id = '11111111-1111-4111-8111-111111111111', templateId = '22222222-2222-4222-8222-222222222222';
function event(path, body, role = 'central') {
  const p = Buffer.from(JSON.stringify({role,scope:'admin',agencyCode:'A',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  return {httpMethod:body ? 'POST' : 'GET',rawUrl:`http://localhost/api${path}`,queryStringParameters:Object.fromEntries(new URL('http://localhost'+path).searchParams),headers:{authorization:`Bearer ${p}.${crypto.createHmac('sha256','fixture').update(p).digest('base64url')}`},body:body && JSON.stringify(body)};
}
const response = data => ({ok:true,status:200,text:async()=>JSON.stringify(data)});
test('제출 목록과 Excel 날짜 역전은 DB 조회 전 400', async () => {
  global.fetch = async()=>{throw Error('DB must not run');};
  for (const endpoint of ['/submissions','/submissions/export']) {
    const r = await handler(event(endpoint+'?startDate=2026-09-17&endDate=2026-09-16'));
    assert.equal(r.statusCode,400,r.body);
  }
});
test('상세 Excel: 특정 설문 필수, 잘못된 UUID 및 100건 초과 차단', async () => {
  global.fetch = async()=>{throw Error('DB must not run');};
  for (const body of [{ids:[id]}, {ids:[id],templateId:'dynamic'}, {templateId,ids:Array.from({length:101},(_,i)=>`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`)}]) {
    const r = await handler(event('/submissions/export-details',body)); assert.equal(r.statusCode,400,r.body);
  }
});
test('상세 Excel: 다른 설문 또는 권한 밖/삭제된 제출건은 다운로드 거부', async () => {
  for (const rows of [[], [{id,template_id:id}]]) {
    global.fetch = async()=>response(rows);
    const r = await handler(event('/submissions/export-details',{ids:[id],templateId})); assert.equal(r.statusCode,400,r.body);
  }
});
test('상세 Excel: 기관 권한과 선택한 설문 필터를 동시에 사용', async () => {
  let requested;
  global.fetch = async url => { requested = new URL(url); return response([{id,template_id:templateId,institution_code:'A',template_snapshot:{scoringEnabled:true,questions:[{answerType:'single_choice',required:true,options:[{score:0},{score:7}]}]}}]); };
  const r = await handler(event('/submissions/export-details',{ids:[id],templateId},'agency'));
  assert.equal(r.statusCode,200,r.body);
  assert.equal(requested.searchParams.get('template_id'),'eq.'+templateId);
  assert.equal(requested.searchParams.get('institution_code'),'eq.A');
  assert.equal(requested.searchParams.get('deleted_at'),'is.null');
  assert.equal(JSON.parse(r.body).rows[0].maxScore,7);
});
test('목록은 실제 제출시각, 전화번호, 관리번호, 만점 필드를 보존', async () => {
  let args;
  global.fetch = async (url,options) => {args=JSON.parse(options.body);return response({rows:[{id,submitted_at:'2026-09-15T15:00:00Z',worker_phone:'01000000000',client_id:'123',max_score:15}],pagination:{totalCount:1}});};
  const r = await handler(event('/submissions?startDate=2026-09-16&endDate=2026-09-16'));
  assert.equal(r.statusCode,200,r.body); assert.equal(args.p_start_date,'2026-09-16');
  assert.equal(args.p_end_date,'2026-09-16');
  const row=JSON.parse(r.body).rows[0];assert.equal(row.maxScore,15);assert.equal(row.clientId,'123');assert.equal(row.workerPhone,'01000000000');assert.equal(row.submittedAt,'2026-09-15T15:00:00Z');
});
