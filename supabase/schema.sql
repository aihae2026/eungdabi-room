create extension if not exists pgcrypto;

create table if not exists public.institutions (
  code text primary key,
  name text not null,
  sido text not null,
  sigungu text not null,
  type text not null check (type in ('agency', 'regional', 'central')),
  parent_code text references public.institutions(code) on update cascade on delete restrict,
  managed_target_count integer not null default 250,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institutions_code_format_check check (code ~ '^[A-Z0-9]+$'),
  constraint institutions_regional_sigungu_check check (type <> 'regional' or sigungu = ''),
  constraint institutions_parent_shape_check check (
    (type = 'central' and parent_code is null)
    or (type in ('regional', 'agency') and parent_code is not null)
  )
);

create table if not exists public.agency_accounts (
  institution_code text primary key references public.institutions(code) on update cascade on delete cascade,
  password_hash text not null,
  password_salt text not null,
  password_updated_at timestamptz not null default now(),
  intake_password_hash text,
  intake_password_salt text,
  intake_password_updated_at timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.agency_accounts
  add column if not exists intake_password_hash text,
  add column if not exists intake_password_salt text,
  add column if not exists intake_password_updated_at timestamptz not null default now();

update public.agency_accounts
set
  intake_password_hash = password_hash,
  intake_password_salt = password_salt,
  intake_password_updated_at = coalesce(password_updated_at, now())
where intake_password_hash is null
  or intake_password_salt is null;

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  institution_code text not null references public.institutions(code) on update cascade,
  checklist_type text not null check (checklist_type in ('fall', 'memory', 'depression')),
  survey_date date not null default current_date,
  worker_name text not null,
  worker_phone text not null,
  client_name text not null,
  client_gender text not null check (client_gender in ('남', '여')),
  client_birth date not null,
  client_id text,
  status text not null default '확인 대기' check (status in ('확인 대기', '확인 완료')),
  field_memo text,
  total_score integer not null default 0,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by text,
  deleted_at timestamptz
);

create table if not exists public.submission_answers (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_no integer not null,
  question_text text not null,
  answer_label text not null,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (submission_id, question_no)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  institution_code text references public.institutions(code) on update cascade,
  actor_code text,
  action text not null,
  target_table text not null,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

-- Dynamic checklist templates created manually or with AI.
-- Templates become immutable after leaving the draft state. This rule is
-- enforced by the application API; status timestamps below preserve the
-- operational lifecycle in the database.
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text,
  purpose text,
  target_audience text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  generation_method text not null default 'manual'
    check (generation_method in ('manual', 'ai_text', 'ai_file')),
  estimated_minutes smallint
    check (estimated_minutes is null or estimated_minutes between 1 and 120),
  scoring_enabled boolean not null default false,
  management_enabled boolean not null default false,
  management_bands jsonb not null default '[]'::jsonb,
  created_by text not null,
  approved_by text,
  copied_from_id uuid references public.checklist_templates(id) on delete set null,
  activated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_templates_lifecycle_check check (
    (status = 'draft' and activated_at is null and closed_at is null)
    or (status = 'active' and activated_at is not null and closed_at is null)
    or (status = 'closed' and activated_at is not null and closed_at is not null)
  )
);

create table if not exists public.template_questions (
  id bigint generated always as identity primary key,
  template_id uuid not null
    references public.checklist_templates(id) on delete cascade,
  question_no integer not null check (question_no > 0),
  question_text text not null check (char_length(btrim(question_text)) between 1 and 1000),
  required boolean not null default false,
  answer_type text not null
    check (answer_type in ('text', 'textarea', 'single_choice', 'multiple_choice')),
  help_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, question_no)
);

create table if not exists public.question_options (
  id bigint generated always as identity primary key,
  question_id bigint not null
    references public.template_questions(id) on delete cascade,
  option_text text not null check (char_length(btrim(option_text)) between 1 and 500),
  score integer not null default 0 check (score between -1000 and 1000),
  display_order integer not null check (display_order > 0),
  requires_text boolean not null default false,
  text_placeholder text check (text_placeholder is null or char_length(text_placeholder) <= 200),
  created_at timestamptz not null default now(),
  unique (question_id, display_order)
);

alter table public.question_options
  add column if not exists requires_text boolean not null default false,
  add column if not exists text_placeholder text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_options_text_placeholder_check'
      and conrelid = 'public.question_options'::regclass
  ) then
    alter table public.question_options
      add constraint question_options_text_placeholder_check
      check (text_placeholder is null or char_length(text_placeholder) <= 200);
  end if;
end
$$;

-- Store operational metadata only. Raw prompts, uploaded file contents, and
-- personal data are intentionally excluded from this table.
create table if not exists public.ai_generation_logs (
  id bigint generated always as identity primary key,
  template_id uuid references public.checklist_templates(id) on delete set null,
  action text not null check (action in ('generate', 'revise', 'review', 'import_file')),
  model text not null,
  status text not null check (status in ('success', 'failed', 'rejected')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  request_metadata jsonb not null default '{}'::jsonb,
  error_code text,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Existing submissions continue to use checklist_type. Dynamic submissions
-- use template_id instead, so exactly one checklist source must be present.
alter table public.submissions
  add column if not exists template_id uuid
    references public.checklist_templates(id) on delete restrict;

alter table public.submissions
  add column if not exists template_snapshot jsonb,
  add column if not exists management_label text;

alter table public.submissions
  alter column checklist_type drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'submissions_checklist_source_check'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_checklist_source_check
      check (num_nonnulls(checklist_type, template_id) = 1);
  end if;
end
$$;

-- answer_value supports text and multiple-choice responses while preserving
-- the existing answer_label snapshot for legacy submissions.
alter table public.submission_answers
  add column if not exists question_id bigint
    references public.template_questions(id) on delete set null,
  add column if not exists answer_value jsonb;

alter table public.submission_answers
  alter column answer_label drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'submission_answers_value_check'
      and conrelid = 'public.submission_answers'::regclass
  ) then
    alter table public.submission_answers
      add constraint submission_answers_value_check
      check (answer_label is not null or answer_value is not null);
  end if;
end
$$;

create index if not exists submissions_institution_status_idx
  on public.submissions (institution_code, status, submitted_at desc)
  where deleted_at is null;

create index if not exists submissions_institution_type_idx
  on public.submissions (institution_code, checklist_type, survey_date desc)
  where deleted_at is null;

create index if not exists submissions_client_id_idx
  on public.submissions (client_id)
  where deleted_at is null and client_id is not null;

create index if not exists checklist_templates_status_created_idx
  on public.checklist_templates (status, created_at desc);

create index if not exists checklist_templates_copied_from_idx
  on public.checklist_templates (copied_from_id)
  where copied_from_id is not null;

create index if not exists template_questions_template_order_idx
  on public.template_questions (template_id, question_no);

create index if not exists question_options_question_order_idx
  on public.question_options (question_id, display_order);

create index if not exists ai_generation_logs_template_created_idx
  on public.ai_generation_logs (template_id, created_at desc);

create index if not exists submissions_template_survey_date_idx
  on public.submissions (template_id, survey_date desc)
  where deleted_at is null and template_id is not null;

-- Admin read models keep large submission sets inside Postgres. They are
-- callable only with the server-side service role used by Netlify Functions.
create or replace function public.admin_home_summary(
  p_institution_codes text[] default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with scoped as materialized (
    select
      s.id,
      s.checklist_type,
      s.template_id,
      s.client_name,
      s.total_score,
      s.submitted_at,
      ct.title as checklist_title
    from public.submissions as s
    left join public.checklist_templates as ct on ct.id = s.template_id
    where s.deleted_at is null
      and (p_institution_codes is null or s.institution_code = any(p_institution_codes))
  ),
  aggregate_values as (
    select
      count(*)::integer as total_count,
      count(*) filter (
        where (submitted_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
      )::integer as today_count,
      count(*) filter (where checklist_type = 'fall')::integer as fall_total,
      count(*) filter (
        where checklist_type = 'fall'
          and (submitted_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
      )::integer as fall_today,
      count(*) filter (where checklist_type = 'depression')::integer as depression_total,
      count(*) filter (
        where checklist_type = 'depression'
          and (submitted_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
      )::integer as depression_today,
      count(*) filter (where checklist_type = 'memory')::integer as memory_total,
      count(*) filter (
        where checklist_type = 'memory'
          and (submitted_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
      )::integer as memory_today,
      count(*) filter (where checklist_type = 'fall' and total_score >= 60)::integer as fall_risk,
      count(*) filter (where checklist_type = 'depression' and total_score >= 10)::integer as depression_risk,
      count(*) filter (where checklist_type = 'memory' and total_score >= 6)::integer as memory_risk
    from scoped
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total', jsonb_build_object('total', a.total_count, 'today', a.today_count),
      'fall', jsonb_build_object('total', a.fall_total, 'today', a.fall_today),
      'depression', jsonb_build_object('total', a.depression_total, 'today', a.depression_today),
      'memory', jsonb_build_object('total', a.memory_total, 'today', a.memory_today)
    ),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.submitted_at desc)
      from (
        select id, checklist_type, template_id, checklist_title, client_name, submitted_at
        from scoped
        order by submitted_at desc
        limit 5
      ) as r
    ), '[]'::jsonb),
    'riskSummary', jsonb_build_object(
      'fall', case when a.fall_total = 0 then 0 else round(a.fall_risk * 100.0 / a.fall_total) end,
      'depression', case when a.depression_total = 0 then 0 else round(a.depression_risk * 100.0 / a.depression_total) end,
      'memory', case when a.memory_total = 0 then 0 else round(a.memory_risk * 100.0 / a.memory_total) end
    )
  )
  from aggregate_values as a;
$$;

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


create or replace function public.admin_submission_stats(
  p_institution_codes text[] default null,
  p_view text default 'overview',
  p_sido text default null,
  p_sigungu text default null,
  p_agency_code text default null,
  p_checklist_type text default null,
  p_start_date date default null,
  p_end_date date default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with scoped as materialized (
    select s.*, i.name as institution_name, i.sido, i.sigungu
    from public.submissions as s
    join public.institutions as i on i.code = s.institution_code
    where s.deleted_at is null
      and (p_institution_codes is null or s.institution_code = any(p_institution_codes))
      and (nullif(btrim(p_sido), '') is null or i.sido = p_sido)
      and (nullif(btrim(p_sigungu), '') is null or i.sigungu = p_sigungu)
      and (nullif(btrim(p_agency_code), '') is null or s.institution_code = p_agency_code)
      and (nullif(btrim(p_checklist_type), '') is null or s.checklist_type = p_checklist_type)
      and (p_start_date is null or s.survey_date >= p_start_date)
      and (p_end_date is null or s.survey_date <= p_end_date)
  ),
  grouped as (
    select
      institution_code,
      max(institution_name) as institution_name,
      max(sido) as sido,
      max(sigungu) as sigungu,
      count(*)::integer as total,
      count(distinct client_id) filter (where client_id is not null)::integer as unique_clients,
      count(*) filter (where checklist_type = 'fall')::integer as fall_total,
      count(*) filter (where checklist_type = 'fall' and status = '확인 대기')::integer as fall_waiting,
      count(*) filter (where checklist_type = 'fall' and status = '확인 완료')::integer as fall_done,
      round(avg(total_score) filter (where checklist_type = 'fall'), 1) as fall_average,
      count(*) filter (where checklist_type = 'depression')::integer as depression_total,
      count(*) filter (where checklist_type = 'depression' and status = '확인 대기')::integer as depression_waiting,
      count(*) filter (where checklist_type = 'depression' and status = '확인 완료')::integer as depression_done,
      round(avg(total_score) filter (where checklist_type = 'depression'), 1) as depression_average,
      count(*) filter (where checklist_type = 'memory')::integer as memory_total,
      count(*) filter (where checklist_type = 'memory' and status = '확인 대기')::integer as memory_waiting,
      count(*) filter (where checklist_type = 'memory' and status = '확인 완료')::integer as memory_done,
      round(avg(total_score) filter (where checklist_type = 'memory'), 1) as memory_average,
      count(*) filter (where checklist_type = 'fall' and total_score <= 25)::integer as fall_low,
      count(*) filter (where checklist_type = 'fall' and total_score > 25 and total_score < 60)::integer as fall_medium,
      count(*) filter (where checklist_type = 'fall' and total_score >= 60)::integer as fall_high,
      count(*) filter (where checklist_type = 'depression' and total_score between 0 and 4)::integer as depression_none,
      count(*) filter (where checklist_type = 'depression' and total_score between 5 and 9)::integer as depression_low,
      count(*) filter (where checklist_type = 'depression' and total_score between 10 and 19)::integer as depression_medium,
      count(*) filter (where checklist_type = 'depression' and total_score >= 20)::integer as depression_high,
      count(*) filter (where checklist_type = 'memory' and total_score between 0 and 5)::integer as memory_normal,
      count(*) filter (where checklist_type = 'memory' and total_score >= 6)::integer as memory_risk
    from scoped
    group by institution_code
  )
  select jsonb_build_object(
    'view', p_view,
    'rows', coalesce(jsonb_agg(to_jsonb(g) order by g.sido, g.sigungu, g.institution_name), '[]'::jsonb),
    'queriedAt', now()
  )
  from grouped as g;
$$;

revoke execute on function public.admin_home_summary(text[]) from public, anon, authenticated;
revoke execute on function public.admin_list_submissions(text[], integer, integer, text, text, text, text, text, text, date, date, text) from public, anon, authenticated;
revoke execute on function public.admin_submission_stats(text[], text, text, text, text, text, date, date) from public, anon, authenticated;
grant execute on function public.admin_home_summary(text[]) to service_role;
grant execute on function public.admin_list_submissions(text[], integer, integer, text, text, text, text, text, text, date, date, text) to service_role;
grant execute on function public.admin_submission_stats(text[], text, text, text, text, text, date, date) to service_role;

create index if not exists submission_answers_question_idx
  on public.submission_answers (question_id)
  where question_id is not null;

create index if not exists institutions_parent_active_idx
  on public.institutions (parent_code, active, type);

create index if not exists audit_logs_institution_code_idx
  on public.audit_logs (institution_code);

create or replace function public.validate_institution_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  expected_parent_type text;
  actual_parent_type text;
  parent_is_active boolean;
begin
  if new.type = 'central' then
    if new.parent_code is not null then raise exception '중앙기관에는 상위 기관을 지정할 수 없습니다.'; end if;
    return new;
  end if;
  expected_parent_type := case when new.type = 'regional' then 'central' else 'regional' end;
  select type, active into actual_parent_type, parent_is_active
  from public.institutions where code = new.parent_code;
  if actual_parent_type is distinct from expected_parent_type then raise exception '올바른 상위 기관을 지정해야 합니다.'; end if;
  if parent_is_active is not true then raise exception '비활성 기관을 상위 기관으로 지정할 수 없습니다.'; end if;
  return new;
end;
$$;

create or replace function public.prevent_invalid_institution_deactivation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.type = 'central' and new.active is false then raise exception '중앙기관은 비활성화할 수 없습니다.'; end if;
  if old.active is true and new.active is false and exists (
    select 1 from public.institutions child where child.parent_code = old.code and child.active is true
  ) then raise exception '활성 상태인 하위 기관이 남아 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_institution_hierarchy_trigger on public.institutions;
create trigger validate_institution_hierarchy_trigger
before insert or update of type, parent_code on public.institutions
for each row execute function public.validate_institution_hierarchy();

drop trigger if exists prevent_invalid_institution_deactivation_trigger on public.institutions;
create trigger prevent_invalid_institution_deactivation_trigger
before update of active on public.institutions
for each row execute function public.prevent_invalid_institution_deactivation();

revoke execute on function public.validate_institution_hierarchy() from public, anon, authenticated;
revoke execute on function public.prevent_invalid_institution_deactivation() from public, anon, authenticated;
grant execute on function public.validate_institution_hierarchy() to service_role;
grant execute on function public.prevent_invalid_institution_deactivation() to service_role;

alter table public.institutions enable row level security;
alter table public.agency_accounts enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_answers enable row level security;
alter table public.audit_logs enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.template_questions enable row level security;
alter table public.question_options enable row level security;
alter table public.ai_generation_logs enable row level security;

-- The browser never accesses Supabase directly. Netlify Functions use the
-- service role after enforcing the application's central-admin permissions.
revoke all on table public.checklist_templates from public, anon, authenticated;
revoke all on table public.template_questions from public, anon, authenticated;
revoke all on table public.question_options from public, anon, authenticated;
revoke all on table public.ai_generation_logs from public, anon, authenticated;
revoke all on table public.institutions from public, anon, authenticated;
revoke all on table public.agency_accounts from public, anon, authenticated;

grant select, insert, update, delete on table public.checklist_templates to service_role;
grant select, insert, update, delete on table public.template_questions to service_role;
grant select, insert, update, delete on table public.question_options to service_role;
grant select, insert, update, delete on table public.ai_generation_logs to service_role;
grant select, insert, update, delete on table public.institutions to service_role;
grant select, insert, update, delete on table public.agency_accounts to service_role;

grant usage, select on sequence public.template_questions_id_seq to service_role;
grant usage, select on sequence public.question_options_id_seq to service_role;
grant usage, select on sequence public.ai_generation_logs_id_seq to service_role;

-- 운영 접근은 브라우저에서 Supabase anon key를 직접 쓰지 않고,
-- Netlify Functions의 service role key를 통해서만 수행한다.
-- service role은 RLS를 우회하므로 별도 공개 policy를 만들지 않는다.

-- Explicit privileges for fresh installations; do not depend on platform defaults.
revoke all on table public.submissions from public, anon, authenticated;
grant select, insert, update, delete on table public.submissions to service_role;
revoke all on table public.submission_answers from public, anon, authenticated;
grant select, insert, update, delete on table public.submission_answers to service_role;
revoke all on table public.audit_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.audit_logs to service_role;
revoke all on sequence public.submission_answers_id_seq from public, anon, authenticated;
grant usage, select on sequence public.submission_answers_id_seq to service_role;
revoke all on sequence public.audit_logs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.audit_logs_id_seq to service_role;
revoke all on sequence public.template_questions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.template_questions_id_seq to service_role;
revoke all on sequence public.question_options_id_seq from public, anon, authenticated;
grant usage, select on sequence public.question_options_id_seq to service_role;
revoke all on sequence public.ai_generation_logs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.ai_generation_logs_id_seq to service_role;
