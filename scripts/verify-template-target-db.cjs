'use strict';
// Isolated PostgreSQL (PGlite): no production connection, no external data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8').replace('create extension if not exists pgcrypto;',''));
  await db.exec(`insert into institutions(code,name,sido,sigungu,type,parent_code) values ('C','가상 중앙','시','','central',null),('R','가상 그룹','시','','regional','C'),('A1','가상 1','시','구','agency','R'),('A2','가상 2','시','구','agency','R');
   insert into checklist_templates(id,title,status,created_by,activated_at) values ('11111111-1111-4111-8111-111111111111','기존 양식','active','C',now());`);
  const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(f=>f.endsWith('_checklist_submission_targets.sql'));
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
  const id='11111111-1111-4111-8111-111111111111';
  const insert=code=>db.query(`insert into submissions(institution_code,template_id,survey_date,worker_name,worker_phone,client_name,client_gender,client_birth,total_score) values ($1,$2,current_date,'가상','000','가상','남','1950-01-01',0)`,[code,id]);
  assert.equal((await db.query('select submission_target_mode from checklist_templates')).rows[0].submission_target_mode,'all');
  await insert('A1');await insert('A2');
  await db.exec(`update checklist_templates set submission_target_mode='selected',submission_target_codes=array['A1'];`);
  assert.equal((await db.query('select submission_target_revision from checklist_templates')).rows[0].submission_target_revision,1);
  await assert.rejects(insert('A2'),/제출 대상/);await insert('A1');
  assert.equal((await db.query('select count(*)::int n from submissions')).rows[0].n,3);
  for(const codes of ["array[]::text[]","array['R']","array['UNKNOWN']","array['A1','A1']","array[null]::text[]"])await assert.rejects(db.exec(`update checklist_templates set submission_target_codes=${codes};`));
  await db.exec(`update institutions set active=false where code='A1';`);await assert.rejects(insert('A1'),/활성/);
  await db.exec(`insert into checklist_templates(title,status,created_by,copied_from_id,submission_target_mode,submission_target_codes) values('비활성 선택 보존 복사본','draft','C','${id}','selected',array['A1']);`);
  await db.exec(`update checklist_templates set submission_target_mode='all',submission_target_codes='{}' where id='${id}'; insert into institutions(code,name,sido,sigungu,type,parent_code) values('NEW','새 기관','시','구','agency','R');`);
  await insert('NEW');await assert.rejects(db.exec(`update checklist_templates set submission_target_mode='selected',submission_target_codes=array['A1'];`),/비활성/);
  await db.exec(`update checklist_templates set status='closed',closed_at=now() where id='${id}';`);await assert.rejects(insert('NEW'),/운영 중/);
  await assert.rejects(db.exec(`update checklist_templates set submission_target_mode='selected',submission_target_codes=array['A2'];`),/종료/);
  for(const role of ['anon','authenticated']) {
   await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from checklist_templates'),/permission denied/);await db.exec('reset role');
  }
  assert.equal((await db.query('select count(*)::int n from submissions')).rows[0].n,4);
  console.log('PASS SQL: full base schema + migration; legacy all, selected guards, inactive, new institution, closed, invalid targets, revision, history preservation, private grants.');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
