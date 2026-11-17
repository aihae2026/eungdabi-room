begin;

alter table public.institutions
  add column if not exists parent_code text;

alter table public.agency_accounts drop constraint if exists agency_accounts_institution_code_fkey;
alter table public.agency_accounts
  add constraint agency_accounts_institution_code_fkey
  foreign key (institution_code) references public.institutions(code)
  on update cascade on delete cascade;

alter table public.submissions drop constraint if exists submissions_institution_code_fkey;
alter table public.submissions
  add constraint submissions_institution_code_fkey
  foreign key (institution_code) references public.institutions(code)
  on update cascade on delete restrict;

alter table public.audit_logs drop constraint if exists audit_logs_institution_code_fkey;
alter table public.audit_logs
  add constraint audit_logs_institution_code_fkey
  foreign key (institution_code) references public.institutions(code)
  on update cascade on delete restrict;

update public.institutions
set code = case code
  when 'SAMPLE-CENTRAL' then 'SAMPLECENTRAL'
  when 'SAMPLE-REG-01' then 'SAMPLEREG01'
  when 'SAMPLE-REG-02' then 'SAMPLEREG02'
  when 'SAMPLE-AG-001' then 'SAMPLEAG001'
  when 'SAMPLE-AG-002' then 'SAMPLEAG002'
  when 'SAMPLE-AG-003' then 'SAMPLEAG003'
  when 'SAMPLE-AG-004' then 'SAMPLEAG004'
  when 'SAMPLE-AG-005' then 'SAMPLEAG005'
  when 'SAMPLE-AG-006' then 'SAMPLEAG006'
  else code
end
where code in ('SAMPLE-CENTRAL', 'SAMPLE-REG-01', 'SAMPLE-REG-02', 'SAMPLE-AG-001', 'SAMPLE-AG-002', 'SAMPLE-AG-003', 'SAMPLE-AG-004', 'SAMPLE-AG-005', 'SAMPLE-AG-006');

update public.submissions
set completed_by = case completed_by
  when 'SAMPLE-CENTRAL' then 'SAMPLECENTRAL'
  when 'SAMPLE-REG-01' then 'SAMPLEREG01'
  when 'SAMPLE-REG-02' then 'SAMPLEREG02'
  when 'SAMPLE-AG-001' then 'SAMPLEAG001'
  when 'SAMPLE-AG-002' then 'SAMPLEAG002'
  when 'SAMPLE-AG-003' then 'SAMPLEAG003'
  when 'SAMPLE-AG-004' then 'SAMPLEAG004'
  when 'SAMPLE-AG-005' then 'SAMPLEAG005'
  when 'SAMPLE-AG-006' then 'SAMPLEAG006'
  else completed_by
end;

update public.audit_logs
set actor_code = replace(actor_code, '-', '')
where actor_code in ('SAMPLE-CENTRAL', 'SAMPLE-REG-01', 'SAMPLE-REG-02', 'SAMPLE-AG-001', 'SAMPLE-AG-002', 'SAMPLE-AG-003', 'SAMPLE-AG-004', 'SAMPLE-AG-005', 'SAMPLE-AG-006');

update public.checklist_templates
set
  created_by = replace(created_by, '-', ''),
  approved_by = case when approved_by is null then null else replace(approved_by, '-', '') end
where created_by like 'DEMO-%' or approved_by like 'DEMO-%';

update public.ai_generation_logs
set created_by = replace(created_by, '-', '')
where created_by like 'DEMO-%';

update public.institutions
set parent_code = case
  when type = 'central' then null
  when type = 'regional' then 'SAMPLECENTRAL'
  when type = 'agency' and sido = '가상특별시' then 'SAMPLEREG01'
  when type = 'agency' and sido = '가상광역도' then 'SAMPLEREG02'
  else parent_code
end;

update public.institutions regional
set parent_code = (
  select central.code from public.institutions central
  where central.type = 'central'
  order by central.created_at
  limit 1
)
where regional.type = 'regional' and regional.parent_code is null;

update public.institutions agency
set parent_code = (
  select regional.code from public.institutions regional
  where regional.type = 'regional' and regional.sido = agency.sido
  order by regional.created_at, regional.code
  limit 1
)
where agency.type = 'agency' and agency.parent_code is null;

alter table public.institutions drop constraint if exists institutions_parent_code_fkey;
alter table public.institutions
  add constraint institutions_parent_code_fkey
  foreign key (parent_code) references public.institutions(code)
  on update cascade on delete restrict;

alter table public.institutions drop constraint if exists institutions_code_format_check;
alter table public.institutions
  add constraint institutions_code_format_check check (code ~ '^[A-Z0-9]+$') not valid;

alter table public.institutions drop constraint if exists institutions_parent_shape_check;
alter table public.institutions
  add constraint institutions_parent_shape_check check (
    (type = 'central' and parent_code is null)
    or (type in ('regional', 'agency') and parent_code is not null)
  ) not valid;

create index if not exists institutions_parent_active_idx
  on public.institutions(parent_code, active, type);

create index if not exists audit_logs_institution_code_idx
  on public.audit_logs(institution_code);

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
    if new.parent_code is not null then
      raise exception '중앙기관에는 상위 기관을 지정할 수 없습니다.';
    end if;
    return new;
  end if;

  expected_parent_type := case when new.type = 'regional' then 'central' else 'regional' end;
  select type, active into actual_parent_type, parent_is_active
  from public.institutions
  where code = new.parent_code;

  if actual_parent_type is distinct from expected_parent_type then
    raise exception '올바른 상위 기관을 지정해야 합니다.';
  end if;
  if parent_is_active is not true then
    raise exception '비활성 기관을 상위 기관으로 지정할 수 없습니다.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_invalid_institution_deactivation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.type = 'central' and new.active is false then
    raise exception '중앙기관은 비활성화할 수 없습니다.';
  end if;
  if old.active is true and new.active is false and exists (
    select 1 from public.institutions child
    where child.parent_code = old.code and child.active is true
  ) then
    raise exception '활성 상태인 하위 기관이 남아 있습니다.';
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

alter table public.institutions validate constraint institutions_code_format_check;
alter table public.institutions validate constraint institutions_parent_shape_check;

commit;
