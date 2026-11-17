-- Account AI schema source. Apply only with explicit production DB approval.
begin;
create table if not exists public.account_ai_settings (
  account_code text primary key references public.agency_accounts(institution_code),
  enabled boolean not null default false,
  provider text not null default '' check (provider in ('','openai','anthropic','google')),
  model text not null default '',
  key_ciphertext text,
  masked_key text not null default '',
  models jsonb not null default '[]'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (not enabled or (key_ciphertext is not null and provider <> '' and model <> ''))
);
create table if not exists public.account_ai_attempts (
  account_code text primary key references public.agency_accounts(institution_code),
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.account_ai_settings enable row level security;
alter table public.account_ai_attempts enable row level security;
revoke all on public.account_ai_settings, public.account_ai_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.account_ai_settings, public.account_ai_attempts to service_role;
create or replace function public.account_ai_take_attempt(p_account_code text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  insert into public.account_ai_attempts(account_code,attempts) values(p_account_code,1)
  on conflict(account_code) do update set
    attempts=case when account_ai_attempts.window_start < now()-interval '1 minute' then 1 else account_ai_attempts.attempts+1 end,
    window_start=case when account_ai_attempts.window_start < now()-interval '1 minute' then now() else account_ai_attempts.window_start end
  returning attempts into n;
  return n <= 5;
end $$;
create or replace function public.account_ai_save(p_account_code text,p_expected_revision bigint,p_enabled boolean,p_provider text,p_model text,p_key_ciphertext text,p_masked_key text,p_models jsonb)
returns setof public.account_ai_settings language plpgsql security invoker set search_path='' as $$
declare current_revision bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account-ai:'||p_account_code,0));
  select revision into current_revision from public.account_ai_settings where account_code=p_account_code for update;
  if coalesce(current_revision,0) <> p_expected_revision then raise exception 'AI_REVISION_CONFLICT'; end if;
  return query insert into public.account_ai_settings(account_code,enabled,provider,model,key_ciphertext,masked_key,models,revision)
  values(p_account_code,p_enabled,p_provider,p_model,p_key_ciphertext,p_masked_key,p_models,p_expected_revision+1)
  on conflict(account_code) do update set enabled=excluded.enabled,provider=excluded.provider,model=excluded.model,key_ciphertext=excluded.key_ciphertext,masked_key=excluded.masked_key,models=excluded.models,revision=excluded.revision,updated_at=now()
  returning *;
end $$;
revoke all on function public.account_ai_take_attempt(text), public.account_ai_save(text,bigint,boolean,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.account_ai_take_attempt(text), public.account_ai_save(text,bigint,boolean,text,text,text,text,jsonb) to service_role;
commit;
