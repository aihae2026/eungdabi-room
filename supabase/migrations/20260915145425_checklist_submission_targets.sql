begin;

-- Existing active forms were available to all institutions. Preserve that scope.
alter table public.checklist_templates
  add column submission_target_mode text not null default 'all',
  add column submission_target_codes text[] not null default '{}',
  add column submission_target_revision integer not null default 0,
  add constraint checklist_submission_targets_shape check (
    submission_target_mode in ('all','selected')
    and array_position(submission_target_codes, null) is null
    and cardinality(submission_target_codes) <= 10000
    and ((submission_target_mode = 'all' and cardinality(submission_target_codes) = 0)
      or (submission_target_mode = 'selected' and cardinality(submission_target_codes) > 0))
  );

create function public.validate_checklist_submission_targets() returns trigger
language plpgsql security invoker set search_path = public as $$
declare target_code text; target public.institutions%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.submission_target_mode is not distinct from old.submission_target_mode
      and new.submission_target_codes is not distinct from old.submission_target_codes then
      new.submission_target_revision := old.submission_target_revision;
      return new;
    end if;
    if old.status = 'closed' then raise exception '종료된 양식의 제출 대상은 변경할 수 없습니다.'; end if;
    new.submission_target_revision := old.submission_target_revision + 1;
  else
    new.submission_target_revision := 0;
  end if;
  if cardinality(new.submission_target_codes) <> (select count(distinct x) from unnest(new.submission_target_codes) x) then
    raise exception '제출 대상 기관이 중복되었습니다.';
  end if;
  foreach target_code in array new.submission_target_codes loop
    select * into target from public.institutions where code = target_code for share;
    if not found or target.type <> 'agency' then raise exception '운영담당자 기관만 제출 대상으로 지정할 수 있습니다.'; end if;
    if not target.active then
      if tg_op = 'INSERT' then
        if not exists (select 1 from public.checklist_templates source where source.id = new.copied_from_id and target_code = any(source.submission_target_codes)) then
          raise exception '비활성 기관을 새로 지정할 수 없습니다.';
        end if;
      elsif not target_code = any(old.submission_target_codes) then
        raise exception '비활성 기관을 새로 지정할 수 없습니다.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
create trigger checklist_submission_targets_validate before insert or update on public.checklist_templates
for each row execute function public.validate_checklist_submission_targets();

-- Lock the policy and institution until insertion commits. A concurrent exclusion,
-- closure or deactivation cannot slip between the API check and the DB insert.
create function public.enforce_checklist_submission_target() returns trigger
language plpgsql security invoker set search_path = public as $$
declare form public.checklist_templates%rowtype; agency public.institutions%rowtype;
begin
  if new.template_id is null then return new; end if;
  select * into form from public.checklist_templates where id = new.template_id for share;
  if not found or form.status <> 'active' then raise exception '현재 운영 중인 양식만 제출할 수 있습니다.'; end if;
  select * into agency from public.institutions where code = new.institution_code for share;
  if not found or not agency.active or agency.type <> 'agency' then
    raise exception '활성 운영담당자 기관만 제출할 수 있습니다.';
  end if;
  if form.submission_target_mode = 'selected' and not agency.code = any(form.submission_target_codes) then
    raise exception '현재 이 기관은 해당 양식의 제출 대상이 아닙니다. 제출 대상이 변경되었을 수 있습니다.';
  end if;
  return new;
end;
$$;
create trigger submissions_target_guard before insert on public.submissions
for each row execute function public.enforce_checklist_submission_target();

revoke all on function public.validate_checklist_submission_targets() from public, anon, authenticated;
revoke all on function public.enforce_checklist_submission_target() from public, anon, authenticated;
grant execute on function public.validate_checklist_submission_targets() to service_role;
grant execute on function public.enforce_checklist_submission_target() to service_role;
-- Keep the existing private-table access model; no new public grants.
alter table public.checklist_templates enable row level security;
revoke all on public.checklist_templates from anon, authenticated;
notify pgrst, 'reload schema';
commit;
