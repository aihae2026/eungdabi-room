// Isolated PostgreSQL/WASM only: never connects to production.
const fs=require('node:fs'),assert=require('node:assert/strict');
let PGlite;
try { ({PGlite}=require('@electric-sql/pglite')); }
catch { ({PGlite}=require('../outputs/survey-db-test/node_modules/@electric-sql/pglite')); }
(async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.agency_accounts(institution_code text primary key); insert into agency_accounts values (\'A\'),(\'B\');');
  const sql=fs.readFileSync(require.resolve('../supabase/account-ai.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const save=(code,revision,enabled,key)=>db.query('select * from account_ai_save($1,$2,$3,$4,$5,$6,$7,$8)',[code,revision,enabled,key?'openai':'',key?'gpt-5.4-mini':'',key,key?'••••test':'',key?'["gpt-5.4-mini"]':'[]']);
  await db.exec('set role service_role');
  assert.equal((await save('A',0,true,'encrypted-fixture')).rows[0].revision,1);
  await assert.rejects(save('A',0,false,null),/AI_REVISION_CONFLICT/);
  assert.equal((await db.query("select count(*)::int n from account_ai_settings where account_code='B'")).rows[0].n,0);
  await assert.rejects(save('MISSING',0,true,'encrypted-fixture'),/foreign key/);
  assert.equal((await save('A',1,false,null)).rows[0].key_ciphertext,null);
  for(let i=1;i<=6;i++)assert.equal((await db.query("select account_ai_take_attempt('A') allowed")).rows[0].allowed,i<=5);
  await db.exec("update account_ai_attempts set window_start=now()-interval '2 minutes'");
  assert.equal((await db.query("select account_ai_take_attempt('A') allowed")).rows[0].allowed,true);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("select has_table_privilege($1,'account_ai_settings','select') allowed",[role])).rows[0].allowed,false);
   assert.equal((await db.query("select has_function_privilege($1,'account_ai_save(text,bigint,boolean,text,text,text,text,jsonb)','execute') allowed",[role])).rows[0].allowed,false);
   await db.exec('set role '+role);await assert.rejects(db.query('select * from account_ai_settings'),/permission denied/);await db.exec('reset role');
  }
  assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('account_ai_settings','account_ai_attempts') and relrowsecurity")).rows[0].n,2);
  console.log('PASS account AI SQL: repeat application, account PK/FK, revision CAS, clear, rate limit/reset, service role, anon/authenticated denial, RLS.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
