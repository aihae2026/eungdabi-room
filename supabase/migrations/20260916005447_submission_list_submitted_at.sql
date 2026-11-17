-- Local implementation only. Apply before deploying the submission-list changes.
-- Computes the maximum possible score, not the highest observed submission score.
create or replace function public.submission_question_max_score(p_questions jsonb)
returns integer language sql immutable security invoker set search_path = ''
as $$
  select case when p_questions is null then null else coalesce(sum(
    case when coalesce((q->>'required')::boolean, false) then m.maximum
         else greatest(0, m.maximum) end
  ),0)::integer end
  from jsonb_array_elements(coalesce(p_questions, '[]'::jsonb)) q
  cross join lateral (
    select case when q->>'answerType' = 'multiple_choice'
                then case when sum(greatest(0,(o->>'score')::integer)) > 0
                          then sum(greatest(0,(o->>'score')::integer))
                          else max((o->>'score')::integer) end
                else max((o->>'score')::integer) end as maximum
    from jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) o
  ) m
  where q->>'answerType' in ('single_choice','multiple_choice');
$$;
revoke execute on function public.submission_question_max_score(jsonb) from public, anon, authenticated;
grant execute on function public.submission_question_max_score(jsonb) to service_role;

create or replace function public.admin_list_submissions(
  p_institution_codes text[] default null,
  p_page integer default 1,
  p_limit integer default 20,
  p_sido text default null,
  p_sigungu text default null,
  p_agency_code text default null,
  p_agency_name text default null,
  p_checklist_filter text default null,
  p_status text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with params as (
    select greatest(coalesce(p_page, 1), 1) as page_no,
           least(greatest(coalesce(p_limit, 20), 1), 5000) as page_limit
  ),
  filtered as materialized (
    select
      s.id,
      s.institution_code,
      i.name as institution_name,
      i.sido,
      i.sigungu,
      s.checklist_type,
      s.template_id,
      ct.title as checklist_title,
      coalesce((s.template_snapshot ->> 'scoringEnabled')::boolean, ct.scoring_enabled) as scoring_enabled,
      s.template_snapshot -> 'questions' as score_questions,
      s.management_label,
      s.template_snapshot ->> 'title' as snapshot_title,
      ct.generation_method as template_generation_method,
      s.survey_date,
      s.worker_name,
      s.worker_phone,
      s.client_name,
      s.client_gender,
      s.client_birth,
      s.client_id,
      s.status,
      s.field_memo,
      s.total_score,
      s.submitted_at,
      s.completed_at,
      s.completed_by
    from public.submissions as s
    join public.institutions as i on i.code = s.institution_code
    left join public.checklist_templates as ct on ct.id = s.template_id
    where s.deleted_at is null
      and (p_institution_codes is null or s.institution_code = any(p_institution_codes))
      and (nullif(btrim(p_sido), '') is null or i.sido = p_sido)
      and (nullif(btrim(p_sigungu), '') is null or i.sigungu = p_sigungu)
      and (nullif(btrim(p_agency_code), '') is null or i.code ilike '%' || p_agency_code || '%')
      and (nullif(btrim(p_agency_name), '') is null or i.name ilike '%' || p_agency_name || '%')
      and (nullif(btrim(p_status), '') is null or s.status = p_status)
      and (p_start_date is null or s.submitted_at >= (p_start_date::timestamp at time zone 'Asia/Seoul'))
      and (p_end_date is null or s.submitted_at < ((p_end_date + 1)::timestamp at time zone 'Asia/Seoul'))
      and (
        nullif(btrim(p_checklist_filter), '') is null
        or (p_checklist_filter = 'dynamic' and s.template_id is not null and ct.generation_method <> 'manual')
        or (p_checklist_filter = 'manual-template' and s.template_id is not null and ct.generation_method = 'manual')
        or s.checklist_type = p_checklist_filter
        or ('template:' || s.template_id::text) = p_checklist_filter
      )
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', i.sido, i.sigungu, i.code, i.name, ct.title, s.worker_name, s.worker_phone, s.client_name, s.client_id)
          ilike '%' || p_search || '%'
      )
  ),
  paged as (
    select f.*, public.submission_question_max_score(coalesce(f.score_questions,
      (select jsonb_agg(jsonb_build_object('answerType', q.answer_type, 'required', q.required, 'options',
        (select jsonb_agg(jsonb_build_object('score', o.score)) from public.question_options o where o.question_id = q.id)))
       from public.template_questions q where q.template_id = f.template_id))) as max_score
    from filtered as f, params as p
    order by f.submitted_at desc, f.id desc
    limit (select page_limit from params)
    offset ((select page_no from params) - 1) * (select page_limit from params)
  ),
  totals as (
    select count(*)::integer as total_count from filtered
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg((to_jsonb(p) - 'score_questions') order by p.submitted_at desc, p.id desc) from paged as p), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', p.page_no,
      'limit', p.page_limit,
      'totalCount', t.total_count,
      'totalPages', greatest(ceil(t.total_count::numeric / p.page_limit)::integer, 1),
      'start', case when t.total_count = 0 then 0 else ((p.page_no - 1) * p.page_limit) + 1 end,
      'end', least(p.page_no * p.page_limit, t.total_count)
    )
  )
  from params as p cross join totals as t;
$$;
revoke execute on function public.admin_list_submissions(text[], integer, integer, text, text, text, text, text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.admin_list_submissions(text[], integer, integer, text, text, text, text, text, text, date, date, text) to service_role;
create index if not exists submissions_submitted_at_live_idx on public.submissions(submitted_at desc, id desc) where deleted_at is null;
