// Isolated PostgreSQL/WASM verification; never uses production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('../outputs/survey-db-test/node_modules/@electric-sql/pglite');
const {buildSql}=require('./build-survey-transition.cjs');
async function main(){
 const db=new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role;');
 // PGlite includes gen_random_uuid natively; it does not package pgcrypto.
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/schema.sql'),'utf8').replace('create extension if not exists pgcrypto;',''));
 // Reproduce the pre-transition schema, not an already migrated database.
 await db.exec('alter table checklist_templates drop column management_enabled,drop column management_bands; alter table submissions drop column template_snapshot,drop column management_label;');
 await db.exec(`insert into institutions(code,name,sido,sigungu,type,parent_code) values ('TESTCENTRAL','테스트 중앙','테스트시','','central',null),('TESTREG','테스트 그룹','테스트시','','regional','TESTCENTRAL'),('TESTAG','테스트 기관','테스트시','테스트구','agency','TESTREG');`);
 for(const [type,score] of [['fall',25],['fall',26],['fall',60],['depression',4],['depression',5],['depression',10],['depression',20],['memory',5],['memory',6]]) {
  const {rows}=await db.query(`insert into submissions(institution_code,checklist_type,total_score,worker_name,worker_phone,client_name,client_gender,client_birth) values('TESTAG',$1,$2,'테스트','01000000000','가상','남','1950-01-01') returning id`,[type,score]);
  await db.query(`insert into submission_answers(submission_id,question_no,question_text,answer_label,score) values($1,1,'과거 문항 원문','과거 응답',0)`,[rows[0].id]);
 }
 await db.exec("update submissions set deleted_at=now() where checklist_type='fall' and total_score=25");
 const before=await db.query('select id,institution_code,total_score,deleted_at from submissions order by id');
 await db.exec(buildSql());
 assert.deepEqual((await db.query('select id,institution_code,total_score,deleted_at from submissions order by id')).rows,before.rows);
 assert.equal((await db.query('select count(*)::int n from submissions where checklist_type is not null')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from checklist_templates')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from template_questions')).rows[0].n,43);
 assert.equal((await db.query('select count(*)::int n from submissions where management_label is null')).rows[0].n,0);
 const list=(await db.query('select admin_list_submissions() data')).rows[0].data;
 assert.equal(list.pagination.totalCount,8);
 assert.ok(list.rows.every(r=>r.management_label));
 const dist=(await db.query("select * from survey_management_distribution('b1000000-0000-4000-8000-000000000001',array['TESTAG'])")).rows;
 assert.equal(dist.reduce((n,r)=>n+Number(r.total),0),2);
 assert.equal((await db.query("select * from survey_management_distribution('b1000000-0000-4000-8000-000000000001',array['OTHER'])")).rows.length,0);
 await db.exec(buildSql());
 assert.equal((await db.query('select count(*)::int n from checklist_templates')).rows[0].n,3);
 assert.equal((await db.query('select count(*)::int n from template_questions')).rows[0].n,43);
 await db.close();
 console.log('PASS: SQL execution, 9 historical submissions, 43 questions, IDs/scores/deleted history, paginated RPC, scoped distribution, idempotent re-run');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
