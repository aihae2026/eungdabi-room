'use strict';
// Isolated PostgreSQL: synthetic data only; no credentials or production connection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const {scoreRange}=require('../netlify/functions/lib/management');
(async()=>{
 const db=new PGlite(),root=path.resolve(__dirname,'..');
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  // Verify the upgrade from the committed pre-change schema, not only a fresh install.
  const baseline=require('node:child_process').execFileSync('git',['show','HEAD:supabase/schema.sql'],{cwd:root,encoding:'utf8'});
  await db.exec(baseline.replace('create extension if not exists pgcrypto;',''));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20260916005447_submission_list_submitted_at.sql'),'utf8'));
  await db.exec(`insert into institutions(code,name,sido,sigungu,type,parent_code) values ('C','중앙','시','','central',null),('R','그룹','시','','regional','C'),('A','첫 기관','시','구','agency','R'),('B','둘째 기관','시','구','agency','R');
    insert into checklist_templates(id,title,status,created_by,activated_at) values ('11111111-1111-4111-8111-111111111111','테스트 설문','active','A',now());`);
  const tid='11111111-1111-4111-8111-111111111111';
  const questions=[{answerType:'single_choice',required:true,options:[{score:0},{score:4}]},{answerType:'multiple_choice',required:false,options:[{score:-3},{score:2},{score:5}]}];
  for (const [code,time,deleted] of [['A','2026-09-15T14:59:59.999Z',false],['A','2026-09-15T15:00:00Z',false],['A','2026-09-16T14:59:59.999Z',false],['A','2026-09-16T15:00:00Z',false],['B','2026-09-16T10:00:00Z',false],['A','2026-09-16T10:00:00Z',true]]) {
   await db.query(`insert into submissions(institution_code,template_id,survey_date,worker_name,worker_phone,client_name,client_gender,client_birth,total_score,submitted_at,deleted_at,template_snapshot)
    values($1,$2,'2000-01-01','가상','000','가상','남','1950-01-01',2,$3,$4,$5)`,[code,tid,time,deleted?time:null,JSON.stringify({title:'제출 당시',scoringEnabled:true,questions})]);
  }
  const list=async(start='2026-09-16',end='2026-09-16',codes=['A'],page=1,limit=20)=> (await db.query(`select public.admin_list_submissions(p_institution_codes=>$1,p_start_date=>$2,p_end_date=>$3,p_page=>$4,p_limit=>$5) result`,[codes,start,end,page,limit])).rows[0].result;
  const result=await list(); assert.equal(result.pagination.totalCount,2);
  assert.equal(result.rows[0].max_score,11);assert.equal(result.rows[0].snapshot_title,'제출 당시');assert(!('score_questions' in result.rows[0]));
  assert.equal((await list(null,null)).pagination.totalCount,4);
  assert.equal((await list(undefined,undefined,null)).pagination.totalCount,3);
  assert.equal((await list('2026-09-16','2026-09-16',['A'],2,1)).pagination.start,2);
  assert.equal((await list('2030-01-01','2030-01-01')).pagination.totalCount,0);
  for(const qs of [questions,[{answerType:'multiple_choice',required:true,options:[{score:-3},{score:-2}]}],[{answerType:'single_choice',required:false,options:[{score:-3},{score:-2}]}],[]]) {
    const r=await db.query('select public.submission_question_max_score($1) maximum',[JSON.stringify(qs)]);assert.equal(r.rows[0].maximum,scoreRange(qs).max);
  }
  await db.exec(`insert into template_questions(template_id,question_no,question_text,required,answer_type) values('${tid}',1,'질문',true,'single_choice');
    insert into question_options(question_id,option_text,score,display_order) values(1,'답',9,1);
    update submissions set template_snapshot=null where institution_code='A';`);
  assert.equal((await list()).rows[0].max_score,9);
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);await assert.rejects(list(),/permission denied/);await db.exec('reset role');
  }
  // Supabase provisions service_role table grants; a bare PGlite instance does not.
  await db.exec('grant select on submissions, institutions to service_role; set role service_role');
  assert.equal((await list()).pagination.totalCount,2);
  console.log('PASS SQL: KST inclusive start/exclusive next-day end, actual submitted_at not survey_date, scope/deleted guards, pagination/empty, snapshot and legacy max scores, service-only grants.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
