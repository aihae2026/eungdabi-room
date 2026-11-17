const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.NETLIFY_AUTH_SECRET = 'test-auth-secret';
const {handler} = require('../netlify/functions/api-legacy.cjs');
const institutions = [
  {code:'A',parent_code:'R1',type:'agency',active:true},
  {code:'B',parent_code:'R2',type:'agency',active:true},
  {code:'OFF',parent_code:'R1',type:'agency',active:false},
];
const templates = [
  {id:'all',title:'전체',status:'active',submission_target_mode:'all'},
  ...['A','B','OFF'].map(code=>({id:code,title:code,status:'active',submission_target_mode:'selected',submission_target_codes:[code]})),
  {id:'draft',status:'draft'}, {id:'closed',status:'closed'},
];
async function request(role, agencyCode, scope='admin', expires=3600) {
  const encoded=Buffer.from(JSON.stringify({scope,role,agencyCode,exp:Math.floor(Date.now()/1000)+expires})).toString('base64url');
  const signature=crypto.createHmac('sha256',process.env.NETLIFY_AUTH_SECRET).update(encoded).digest('base64url');
  return handler({httpMethod:'GET',rawUrl:'http://localhost/api/home-templates',headers:{authorization:`Bearer ${encoded}.${signature}`}});
}
test('home surveys: scoped active-only metadata for all admin roles',async()=>{
  const original=global.fetch;
  const calls=[];
  global.fetch=async url=>{
    const u=new URL(url); calls.push(u);
    let rows;
    if(u.pathname.endsWith('/institutions')) {
      assert.equal(u.searchParams.get('active'),'is.true');
      assert.equal(u.searchParams.get('type'),'eq.agency');
      rows=institutions.filter(i=>i.active && (!u.searchParams.has('parent_code') || u.searchParams.get('parent_code')===`eq.${i.parent_code}`) && (!u.searchParams.has('code') || u.searchParams.get('code')===`eq.${i.code}`));
    } else {
      assert.equal(u.searchParams.get('status'),'eq.active');
      assert(!u.searchParams.get('select').includes('*'));
      rows=templates;
    }
    return {ok:true,status:200,text:async()=>JSON.stringify(rows)};
  };
  try {
    for(const [role,code,ids] of [
      ['central','C',['all','A','B','OFF']],
      ['regional','R1',['all','A']],
      ['regional','R2',['all','B']],
      ['regional','EMPTY',[]],
      ['agency','A',['all','A']],
      ['agency','B',['all','B']],
      ['agency','OFF',[]],
    ]) {
      const result=await request(role,code);
      assert.equal(result.statusCode,200);
      const rows=JSON.parse(result.body).templates;
      assert.deepEqual(rows.map(r=>r.id),ids,`${role}/${code}`);
      assert(rows.every(r=>!('submission_target_codes' in r)));
    }
    const count=calls.length;
    assert.equal((await request('agency','A','intake')).statusCode,403);
    assert.equal((await request('unknown','A')).statusCode,403);
    for(const role of ['central','regional','agency']) assert.equal((await request(role,'A','admin',-60)).statusCode,401);
    assert.equal((await handler({httpMethod:'GET',rawUrl:'http://localhost/api/home-templates',headers:{}})).statusCode,401);
    assert.equal(calls.length,count);
  } finally {global.fetch=original;}
});
