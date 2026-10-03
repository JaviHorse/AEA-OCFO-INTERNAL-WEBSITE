-- Additive migration: Sheets request register; keep financial records and RLS.
-- Apply after 004. Safe to reapply. Do not rerun migration 001 on an existing DB.
begin;
create table if not exists public.request_register_sync (
 request_id uuid primary key references public.requests(id) on delete cascade,
 version bigint not null default 1,
 synced_version bigint not null default 0,
 last_error text,
 synced_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.request_register_sync enable row level security;
revoke all on public.request_register_sync from public,anon,authenticated;
grant select on public.request_register_sync to authenticated;
grant all on public.request_register_sync to service_role;
drop policy if exists register_finance_read on public.request_register_sync;
create policy register_finance_read on public.request_register_sync for select to authenticated
 using(public.finance_request(request_id));
create table if not exists public.request_register_lease (
 id boolean primary key default true check(id), token uuid, expires_at timestamptz
);
alter table public.request_register_lease enable row level security;
revoke all on public.request_register_lease from public,anon,authenticated;
grant all on public.request_register_lease to service_role;
insert into public.request_register_lease(id) values(true) on conflict do nothing;

create or replace function public.enqueue_request_register() returns trigger
language plpgsql security definer set search_path=public as $$ begin
 if new.reference_code is not null and new.status<>'DRAFT' then
  insert into request_register_sync(request_id) values(new.id)
  on conflict(request_id) do update set version=request_register_sync.version+1,
   updated_at=now(),next_attempt_at=now();
 end if;
 return new;
end $$;
revoke all on function public.enqueue_request_register() from public,anon,authenticated;
drop trigger if exists enqueue_request_register on public.requests;
create trigger enqueue_request_register after insert or update of status,title,amount,source_folder_url,updated_at
 on public.requests for each row execute function public.enqueue_request_register();
insert into public.request_register_sync(request_id)
 select id from public.requests where reference_code is not null and status<>'DRAFT'
 on conflict do nothing;

create or replace function public.claim_request_register_lease() returns uuid
language plpgsql security definer set search_path=public as $$ declare claimed uuid; begin
 update request_register_lease set token=gen_random_uuid(),expires_at=clock_timestamp()+interval '120 seconds'
 where id and (expires_at is null or expires_at<clock_timestamp()) returning token into claimed;
 return claimed;
end $$;
create or replace function public.renew_request_register_lease(p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$ begin
 update request_register_lease set expires_at=clock_timestamp()+interval '120 seconds'
 where id and token=p_token and expires_at>clock_timestamp(); return found;
end $$;
create or replace function public.pending_request_register_jobs(p_request_id uuid default null)
returns setof public.request_register_sync language sql security definer set search_path=public as $$
 select q.* from request_register_sync q where q.version>q.synced_version
 and (p_request_id is null or q.request_id=p_request_id)
 and (p_request_id is not null or q.next_attempt_at<=now())
 order by q.updated_at limit 3;
$$;
create or replace function public.release_request_register_lease(p_token uuid) returns void
language sql security definer set search_path=public as $$
 update request_register_lease set token=null,expires_at=null where id and token=p_token;
$$;
create or replace function public.finish_request_register_sync(p_token uuid,p_request_id uuid,p_version bigint,p_error text default null) returns boolean
language plpgsql security definer set search_path=public as $$ begin
 if not exists(select 1 from request_register_lease where id and token=p_token and expires_at>clock_timestamp()) then return false; end if;
 if p_error is null then
  update request_register_sync set synced_version=greatest(synced_version,p_version),synced_at=now(),
   last_error=case when version=p_version then null else last_error end
   where request_id=p_request_id and version>=p_version;
 else
  update request_register_sync set last_error=left(p_error,500),next_attempt_at=now()+interval '5 minutes'
   where request_id=p_request_id and version=p_version;
 end if;
 return found;
end $$;
revoke all on function public.claim_request_register_lease() from public,anon,authenticated;
revoke all on function public.pending_request_register_jobs(uuid) from public,anon,authenticated;
revoke all on function public.renew_request_register_lease(uuid) from public,anon,authenticated;
revoke all on function public.release_request_register_lease(uuid) from public,anon,authenticated;
revoke all on function public.finish_request_register_sync(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_request_register_lease(),public.renew_request_register_lease(uuid),
 public.release_request_register_lease(uuid),public.finish_request_register_sync(uuid,uuid,bigint,text) to service_role;
grant execute on function public.pending_request_register_jobs(uuid) to service_role;

-- Retire only the old archive prerequisite. Document verification, notes,
-- budget overrides, atomic commitments and authorization remain in the engine.
do $$ declare definition text; obsolete text := $guard$if r.drive_copy_status<>'COPIED' and notes is null then raise exception 'Official documents have not been archived; override reason required.'; end if;$guard$;
begin
 definition:=pg_get_functiondef('public.finance_engine_internal(uuid,text,jsonb)'::regprocedure);
 if position(obsolete in definition)>0 then execute replace(definition,obsolete,'-- Documents are reviewed from the submitted folder; no archive prerequisite.');
 elsif position('Official documents have not been archived' in definition)>0 then raise exception 'Unexpected finance engine definition; archive guard was not safely removed.';
 end if;
end $$;
-- Preserve these historical columns/tables; stop producing old copy alerts.
update public.discrepancies set status='RESOLVED',resolved_at=now(),resolution_notes='Drive copying retired; supporting documents are reviewed from the submitted folder.'
 where code='DRIVE_COPY_FAILED' and status='OPEN';
commit;
