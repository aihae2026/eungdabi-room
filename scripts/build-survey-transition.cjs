// Generates a reviewable, transactional SQL script; never connects to a database.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function legacyTemplates() {
  const source = fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
  const defs = vm.runInNewContext(source.slice(source.indexOf('const checklistDefs ='),source.indexOf('let institutionMaster')) + '\nchecklistDefs');
  const ranges = {fall:[[0,25,'저위험'],[26,59,'중위험'],[60,100,'고위험']],depression:[[0,4,'우울아님'],[5,9,'가벼운 우울'],[10,19,'중간정도의 우울'],[20,27,'심한 우울']],memory:[[0,5,'정상'],[6,14,'위험군']]};
  return Object.entries(defs).map(([key,d],i) => ({id:`b1000000-0000-4000-8000-00000000000${i+1}`,legacyType:key,title:d.label,generationMethod:'manual',scoringEnabled:true,managementEnabled:true,managementBands:ranges[key].map(([min,max,name])=>({min,max,name})),questions:d.questions.map((text,n)=>({questionNo:n+1,questionText:text,required:true,answerType:'single_choice',options:d.options.map((o,k)=>({optionText:o.label,score:o.value,displayOrder:k+1}))}))}));
}
function buildSql() {
  const data = JSON.stringify(legacyTemplates()).replaceAll("'","''");
  const schema = fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8');
  const start = schema.indexOf('create or replace function public.admin_list_submissions(');
  const end = schema.indexOf('create or replace function public.admin_submission_stats(', start);
  if (start < 0 || end < 0) throw new Error('Submission list RPC not found');
  const list = schema.slice(start,end).replace('      s.completed_by\n','      s.completed_by\n');
  return `begin;
-- Keep writes out while re-linking historical rows. Run during approved maintenance.
lock table public.submissions, public.submission_answers, public.checklist_templates in share row exclusive mode;
alter table public.checklist_templates add column if not exists management_enabled boolean not null default false;
alter table public.checklist_templates add column if not exists management_bands jsonb not null default '[]'::jsonb;
alter table public.submissions add column if not exists template_snapshot jsonb;
alter table public.submissions add column if not exists management_label text;
create temporary table transition_before on commit drop as select id,institution_code,total_score,checklist_type,template_id,deleted_at from public.submissions;
create temporary table transition_answers_before on commit drop as select id,submission_id,question_no,question_text,answer_label,score,answer_value from public.submission_answers;
do $migration$
declare t jsonb; q jsonb; o jsonb; qid bigint;
begin
  for t in select value from jsonb_array_elements('${data}'::jsonb) loop
    if not exists(select 1 from public.checklist_templates where id=(t->>'id')::uuid) then
      insert into public.checklist_templates(id,title,status,generation_method,scoring_enabled,management_enabled,management_bands,created_by,approved_by,activated_at)
      values((t->>'id')::uuid,t->>'title','active','manual',true,true,t->'managementBands','legacy-transition','legacy-transition',now());
      for q in select value from jsonb_array_elements(t->'questions') loop
        insert into public.template_questions(template_id,question_no,question_text,required,answer_type)
        values((t->>'id')::uuid,(q->>'questionNo')::integer,q->>'questionText',true,'single_choice') returning id into qid;
        for o in select value from jsonb_array_elements(q->'options') loop
          insert into public.question_options(question_id,option_text,score,display_order)
          values(qid,o->>'optionText',(o->>'score')::integer,(o->>'displayOrder')::integer);
        end loop;
      end loop;
    elsif exists(select 1 from public.checklist_templates where id=(t->>'id')::uuid and (title<>t->>'title' or generation_method<>'manual' or management_bands<>t->'managementBands')) then
      raise exception 'Migration template ID collision';
    end if;
    if exists(select 1 from public.submissions s where s.checklist_type=t->>'legacyType' and not exists(select 1 from jsonb_array_elements(t->'managementBands') b where s.total_score between (b->>'min')::integer and (b->>'max')::integer)) then
      raise exception 'Legacy score outside supported range; review before migration';
    end if;
    update public.submissions s set template_id=(t->>'id')::uuid,checklist_type=null,template_snapshot=t,
      management_label=(select b->>'name' from jsonb_array_elements(t->'managementBands') b where s.total_score between (b->>'min')::integer and (b->>'max')::integer)
    where s.checklist_type=t->>'legacyType';
    update public.submission_answers a set question_id=q.id
    from public.submissions s,public.template_questions q
    where a.submission_id=s.id and s.template_id=(t->>'id')::uuid and q.template_id=s.template_id and q.question_no=a.question_no and a.question_id is null;
  end loop;
  if exists((select id,institution_code,total_score,deleted_at from transition_before except select id,institution_code,total_score,deleted_at from public.submissions)
    union all (select id,institution_code,total_score,deleted_at from public.submissions except select id,institution_code,total_score,deleted_at from transition_before)) then raise exception 'Submission preservation failed'; end if;
  if exists((select * from transition_answers_before except select id,submission_id,question_no,question_text,answer_label,score,answer_value from public.submission_answers)
    union all (select id,submission_id,question_no,question_text,answer_label,score,answer_value from public.submission_answers except select * from transition_answers_before)) then raise exception 'Answer preservation failed'; end if;
end $migration$;
${list}
${fs.readFileSync(path.join(root,'supabase/survey-management.sql'),'utf8')}
commit;`;
}
module.exports = {legacyTemplates,buildSql};
if (require.main === module) process.stdout.write(buildSql());
