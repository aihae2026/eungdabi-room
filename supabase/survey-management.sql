-- Run after schema.sql / as part of build-survey-transition.cjs output.
create or replace function public.survey_management_distribution(
  p_template_id uuid, p_institution_codes text[] default null,
  p_sido text default null, p_sigungu text default null, p_agency_code text default null,
  p_start_date date default null, p_end_date date default null
) returns table(management_label text,total bigint)
language sql stable security invoker set search_path=''
as $$
  select coalesce(s.management_label,'미분류'),count(*)
  from public.submissions s join public.institutions i on i.code=s.institution_code
  where s.template_id=p_template_id and s.deleted_at is null
    and (p_institution_codes is null or s.institution_code=any(p_institution_codes))
    and (nullif(p_sido,'') is null or i.sido=p_sido)
    and (nullif(p_sigungu,'') is null or i.sigungu=p_sigungu)
    and (nullif(p_agency_code,'') is null or i.code=p_agency_code)
    and (p_start_date is null or s.survey_date>=p_start_date)
    and (p_end_date is null or s.survey_date<=p_end_date)
  group by coalesce(s.management_label,'미분류') order by coalesce(s.management_label,'미분류');
$$;
revoke all on function public.survey_management_distribution(uuid,text[],text,text,text,date,date) from public,anon,authenticated;
grant execute on function public.survey_management_distribution(uuid,text[],text,text,text,date,date) to service_role;
