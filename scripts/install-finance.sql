-- AEA Finance: execute once in Supabase SQL editor (or supabase db push).
begin;
create type public.finance_role as enum ('CFO_ADMIN','OCFO_MEMBER','DEPARTMENT_MEMBER','PROJECT_MEMBER');
create type public.request_status as enum ('DRAFT','SUBMITTED','UNDER_OCFO_REVIEW','NEEDS_REVISION','READY_FOR_CFO','APPROVED','PROCESSING','COMPLETED','REJECTED','CANCELLED');
create table public.users (id uuid primary key references auth.users(id), email text not null unique, full_name text, avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.fiscal_years (id uuid primary key default gen_random_uuid(), label text not null, code text not null unique check(code ~ '^[0-9]{4}$'), start_date date not null, end_date date not null check(end_date >= start_date), is_active boolean not null default false, is_closed boolean not null default false, closed_at timestamptz, next_sequence integer not null default 0);
create unique index one_active_year on public.fiscal_years(is_active) where is_active;
create table public.departments (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, is_active boolean not null default true);
create table public.memberships (id uuid primary key default gen_random_uuid(), user_id uuid references public.users(id), email text not null, fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), role public.finance_role not null, is_active boolean not null default true, unique(email,fiscal_year_id,department_id));
create table public.projects (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null references public.fiscal_years(id), name text not null, description text, start_date date, end_date date, status text not null default 'PLANNED', created_by uuid references public.users(id));
create table public.project_departments (project_id uuid references public.projects(id), department_id uuid references public.departments(id), primary key(project_id,department_id));
create table public.project_members (project_id uuid references public.projects(id), user_id uuid references public.users(id), department_id uuid references public.departments(id), primary key(project_id,user_id));
create table public.department_budgets (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), initial_approved_budget numeric(14,2) not null default 0 check(initial_approved_budget >= 0), notes text, unique(fiscal_year_id,department_id));
create table public.request_types (id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text, is_active boolean not null default true, creates_commitment boolean not null default false, process_config jsonb not null default '{}');
create table public.document_requirements (id uuid primary key default gen_random_uuid(), request_type_id uuid not null references public.request_types(id), document_code text not null, label text not null, is_required boolean not null default true, condition_type text, condition_json jsonb, display_order integer not null default 0, template_url text, unique(request_type_id,document_code));
create table public.requests (id uuid primary key default gen_random_uuid(), reference_code text unique, creation_key uuid unique, fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), project_id uuid references public.projects(id), request_type_id uuid not null references public.request_types(id), requester_user_id uuid not null references public.users(id), title text not null, purpose text, amount numeric(14,2) not null check(amount <> 0), relevant_date date, notes text, status public.request_status not null default 'DRAFT', source_folder_url text, source_folder_id text, official_folder_url text, official_folder_id text, drive_copy_status text not null default 'PENDING', drive_error_message text, copied_at timestamptz, archive_batch uuid not null default gen_random_uuid(), drive_copy_started_at timestamptz, drive_checked_at timestamptz, submitted_at timestamptz, approved_at timestamptz, completed_at timestamptz, cancelled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.budget_adjustments (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), request_id uuid references public.requests(id), amount_delta numeric(14,2) not null, type text not null, reason text not null, approved_by uuid not null references public.users(id), approved_at timestamptz not null default now(), status text not null default 'APPROVED', unique(request_id));
create table public.request_reviews (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), reviewer_user_id uuid not null references public.users(id), review_status text not null check(review_status in ('PENDING_REVIEW','REVIEWED','HAS_COMMENTS')), recommendation text not null check(recommendation in ('APPROVE','REVISION','NONE')), comments text, reviewed_at timestamptz not null default now(), unique(request_id,reviewer_user_id));
create table public.request_comments (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), author_user_id uuid not null references public.users(id), visibility text not null check(visibility in ('INTERNAL_OCFO','REQUESTER_VISIBLE')), body text not null, created_at timestamptz not null default now(), edited_at timestamptz);
create table public.request_status_history (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), from_status public.request_status, to_status public.request_status not null, changed_by uuid references public.users(id), notes text, created_at timestamptz not null default now());
create table public.approvals (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), approver_user_id uuid not null references public.users(id), decision text not null check(decision in ('APPROVED','REJECTED','RETURNED')), notes text, decided_at timestamptz not null default now());
create table public.commitments (id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.requests(id), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), original_amount numeric(14,2) not null check(original_amount > 0), remaining_amount numeric(14,2) not null check(remaining_amount >= 0), status text not null check(status in ('ACTIVE','RELEASED','FULFILLED','CANCELLED')), created_at timestamptz not null default now(), released_at timestamptz);
create table public.transactions (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), project_id uuid references public.projects(id), request_id uuid references public.requests(id), type text not null check(type in ('EXPENSE','REVENUE')), amount numeric(14,2) not null check(amount > 0), transaction_date date not null, description text not null, created_by uuid not null references public.users(id), verified_by uuid references public.users(id), created_at timestamptz not null default now(), idempotency_key uuid not null unique);
create table public.drive_documents (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.requests(id), document_requirement_id uuid references public.document_requirements(id), source_file_id text, official_file_id text, file_name text not null, mime_type text, official_file_url text, verification_status text not null default 'PENDING', copied_at timestamptz, archive_batch uuid not null, source_modified_time timestamptz, official_modified_time timestamptz, unique(request_id,source_file_id,archive_batch));
create table public.request_document_checks (request_id uuid references public.requests(id), document_requirement_id uuid references public.document_requirements(id), verified_by uuid references public.users(id), verified_at timestamptz not null default now(), is_verified boolean not null, primary key(request_id,document_requirement_id));
create table public.project_reports (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), request_id uuid references public.requests(id), total_expenses numeric(14,2) not null, total_revenue numeric(14,2) not null, variance numeric(14,2) not null, status text not null default 'SUBMITTED', submitted_at timestamptz not null default now(), verified_at timestamptz);
create table public.discrepancies (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid not null references public.fiscal_years(id), department_id uuid not null references public.departments(id), code text not null, severity text not null check(severity in ('CRITICAL','HIGH','WARNING')), entity_type text not null, entity_id uuid not null, description text not null, status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','DISMISSED')), detected_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references public.users(id), resolution_notes text);
create unique index unique_open_issue on public.discrepancies(code,entity_type,entity_id) where status='OPEN';
create table public.notifications (id uuid primary key default gen_random_uuid(), event_type text not null, recipient text not null, request_id uuid references public.requests(id), fiscal_year_id uuid references public.fiscal_years(id), department_id uuid references public.departments(id), sent_at timestamptz, delivery_status text not null default 'PENDING', provider_message_id text, error text, created_at timestamptz not null default now());
create table public.faq_guides (id uuid primary key default gen_random_uuid(), fiscal_year_id uuid references public.fiscal_years(id), title text not null, slug text not null, content text not null, display_order integer not null default 0, is_published boolean not null default true, updated_by uuid references public.users(id));
create table public.organization_settings (key text primary key, value jsonb not null);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.users(id), action text not null, entity_type text not null, entity_id uuid, fiscal_year_id uuid references public.fiscal_years(id), department_id uuid references public.departments(id), old_data jsonb, new_data jsonb, metadata jsonb, created_at timestamptz not null default now());
create index requests_scope on public.requests(fiscal_year_id,department_id,status);
create index transactions_scope on public.transactions(fiscal_year_id,department_id,transaction_date);
create index membership_email on public.memberships(lower(email),fiscal_year_id) where is_active;

-- Security helpers evaluate identities from validated JWTs, never client role fields.
create function public.has_access(y uuid, d uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships m where lower(m.email)=lower(auth.jwt()->>'email') and m.is_active and ((m.fiscal_year_id=y and (m.role in ('CFO_ADMIN','OCFO_MEMBER') or (m.department_id=d and m.role='DEPARTMENT_MEMBER'))) or (m.role in ('CFO_ADMIN','OCFO_MEMBER') and exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active))) and exists(select 1 from memberships a join fiscal_years f on f.id=a.fiscal_year_id where f.is_active and a.is_active and lower(a.email)=lower(auth.jwt()->>'email')) and split_part(lower(auth.jwt()->>'email'),'@',2)=coalesce((select value #>> '{}' from organization_settings where key='allowed_email_domain'),'student.ateneo.edu'));
$$;
create function public.is_finance(y uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from memberships m where lower(m.email)=lower(auth.jwt()->>'email') and (m.fiscal_year_id=y or exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active)) and m.is_active and m.role in ('CFO_ADMIN','OCFO_MEMBER')) and public.has_access(y); $$;
create function public.is_admin(y uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from memberships m where lower(m.email)=lower(auth.jwt()->>'email') and (m.fiscal_year_id=y or exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active)) and m.is_active and m.role='CFO_ADMIN') and public.has_access(y); $$;
create function public.active_member() returns boolean language sql stable security definer set search_path=public as $$ select public.has_access(id,(select department_id from memberships where lower(email)=lower(auth.jwt()->>'email') and fiscal_year_id=fiscal_years.id and is_active limit 1)) from fiscal_years where is_active; $$;
create function public.can_read_request(r uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.has_access(fiscal_year_id,department_id) from requests where id=r; $$;
create function public.finance_request(r uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_finance(fiscal_year_id) from requests where id=r; $$;

-- Browser clients are read-only. All writes use narrowly scoped, validated server RPCs.
do $$ declare t text; begin
 foreach t in array array['users','fiscal_years','departments','memberships','projects','project_departments','project_members','department_budgets','budget_adjustments','request_types','document_requirements','requests','request_reviews','request_comments','request_status_history','approvals','commitments','transactions','drive_documents','request_document_checks','project_reports','discrepancies','notifications','faq_guides','organization_settings','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['department_budgets','budget_adjustments','requests','commitments','transactions','project_reports','discrepancies'] loop
 execute format('create policy scoped_read on public.%I for select to authenticated using(public.has_access(fiscal_year_id,department_id))',t);
 end loop;
 foreach t in array array['approvals','request_status_history','drive_documents','request_document_checks'] loop
 execute format('create policy request_read on public.%I for select to authenticated using(public.can_read_request(request_id))',t);
 end loop;
end $$;
create policy users_read on public.users for select to authenticated using(id=auth.uid() or exists(select 1 from requests r where r.requester_user_id=users.id and public.can_read_request(r.id)) or exists(select 1 from fiscal_years f where f.is_active and public.is_finance(f.id)));
create policy memberships_read on public.memberships for select to authenticated using(lower(email)=lower(auth.jwt()->>'email') or public.is_admin(fiscal_year_id));
create policy years_read on public.fiscal_years for select to authenticated using(public.active_member());
create policy departments_read on public.departments for select to authenticated using(exists(select 1 from memberships m join fiscal_years f on f.id=m.fiscal_year_id where f.is_active and m.is_active and lower(m.email)=lower(auth.jwt()->>'email') and public.has_access(f.id,departments.id)));
create policy types_read on public.request_types for select to authenticated using(public.active_member());
create policy requirements_read on public.document_requirements for select to authenticated using(public.active_member());
create policy projects_read on public.projects for select to authenticated using(public.is_finance(fiscal_year_id) or exists(select 1 from project_departments pd where pd.project_id=projects.id and public.has_access(projects.fiscal_year_id,pd.department_id)));
create policy project_depts_read on public.project_departments for select to authenticated using(exists(select 1 from projects p where p.id=project_id and public.has_access(p.fiscal_year_id,department_id)));
create policy project_members_read on public.project_members for select to authenticated using(exists(select 1 from projects p where p.id=project_id and public.has_access(p.fiscal_year_id,department_id)));
create policy review_read on public.request_reviews for select to authenticated using(public.finance_request(request_id));
create policy comments_read on public.request_comments for select to authenticated using(public.can_read_request(request_id) and (visibility='REQUESTER_VISIBLE' or public.finance_request(request_id)));
create policy guides_read on public.faq_guides for select to authenticated using(public.active_member() and (is_published or exists(select 1 from fiscal_years f where f.is_active and public.is_finance(f.id))));
create policy settings_read on public.organization_settings for select to authenticated using(public.active_member());
create policy notifications_read on public.notifications for select to authenticated using(public.is_finance(fiscal_year_id) or lower(recipient)=lower(auth.jwt()->>'email'));
create policy audit_read on public.audit_logs for select to authenticated using(public.is_finance(fiscal_year_id));

create view public.department_financials with(security_invoker=true) as
select b.id,b.fiscal_year_id,b.department_id,b.initial_approved_budget,
 b.initial_approved_budget+coalesce(a.adjustments,0) current_budget,coalesce(a.adjustments,0) adjustments,
 coalesce(t.expenses,0) actual_expenses,coalesce(t.revenue,0) actual_revenue,coalesce(c.committed,0) active_commitments,
 b.initial_approved_budget+coalesce(a.adjustments,0)-coalesce(t.expenses,0)-coalesce(c.committed,0) available_funds
from department_budgets b
left join lateral(select sum(amount_delta) adjustments from budget_adjustments where fiscal_year_id=b.fiscal_year_id and department_id=b.department_id and status='APPROVED') a on true
left join lateral(select sum(amount) filter(where type='EXPENSE') expenses,sum(amount) filter(where type='REVENUE') revenue from transactions where fiscal_year_id=b.fiscal_year_id and department_id=b.department_id) t on true
left join lateral(select sum(remaining_amount) committed from commitments where fiscal_year_id=b.fiscal_year_id and department_id=b.department_id and status='ACTIVE') c on true;
grant select on public.department_financials to authenticated;

-- Server-only atomic finance engine. Membership is revalidated inside the transaction.
create function public.assert_actor(actor uuid,y uuid,d uuid,admin_only boolean default false,finance_only boolean default false) returns public.finance_role language plpgsql security definer set search_path=public as $$
declare rr finance_role; begin
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'This fiscal year is closed and read-only.'; end if;
 if not exists(select 1 from users u join memberships m on lower(m.email)=lower(u.email) join fiscal_years f on f.id=m.fiscal_year_id where u.id=actor and f.is_active and m.is_active and split_part(lower(u.email),'@',2)=coalesce((select value #>> '{}' from organization_settings where key='allowed_email_domain'),'student.ateneo.edu')) then raise exception 'No active membership.'; end if;
 select m.role into rr from memberships m join users u on lower(u.email)=lower(m.email) where u.id=actor and (m.fiscal_year_id=y or (m.role in ('CFO_ADMIN','OCFO_MEMBER') and exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active))) and m.is_active and ((m.department_id=d and m.role='DEPARTMENT_MEMBER') or m.role in ('CFO_ADMIN','OCFO_MEMBER')) order by case m.role when 'CFO_ADMIN' then 0 when 'OCFO_MEMBER' then 1 else 2 end limit 1;
 if rr is null or (admin_only and rr <> 'CFO_ADMIN') or (finance_only and rr not in ('CFO_ADMIN','OCFO_MEMBER')) then raise exception 'Permission denied.'; end if;
 return rr;
end $$;
create function public.finance_command(actor uuid,command text,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r requests; rt request_types; rr finance_role; y uuid; d uuid; rid uuid; target request_status; amt numeric(14,2); before_available numeric; expense_total numeric; notes text; result jsonb; prior jsonb; req record; config jsonb; begin
 notes:=nullif(trim(p->>'notes'),'');
 if command in ('SAVE_REQUEST','SUBMIT_REQUEST') then
 y:=(p->>'fiscal_year_id')::uuid; d:=(p->>'department_id')::uuid;
 rr:=assert_actor(actor,y,d); select * into rt from request_types where id=(p->>'request_type_id')::uuid and is_active;
 if rt.id is null then raise exception 'Invalid request type.'; end if;
 amt:=(p->>'amount')::numeric(14,2);
 if amt=0 or (amt<0 and rt.code<>'BUDGET_CHANGE') then raise exception 'Enter a valid nonzero amount.'; end if;
 if length(trim(p->>'title')) not between 3 and 160 then raise exception 'Title must be 3â€“160 characters.'; end if;
 if nullif(p->>'project_id','') is not null and not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=d) then raise exception 'Project does not belong to this department/year.'; end if;
 if nullif(p->>'id','') is not null then
 select * into r from requests where id=(p->>'id')::uuid for update;
 if r.id is null or r.fiscal_year_id<>y or r.department_id<>d or r.status not in ('DRAFT','NEEDS_REVISION') then raise exception 'This request cannot be edited.'; end if;
 prior:=to_jsonb(r); rid:=r.id;
 update requests set request_type_id=rt.id,project_id=nullif(p->>'project_id','')::uuid,title=trim(p->>'title'),purpose=p->>'title',amount=amt,relevant_date=nullif(p->>'relevant_date','')::date,notes=notes,source_folder_url=p->>'source_folder_url',source_folder_id=p->>'source_folder_id',updated_at=now() where id=rid;
 else
 if nullif(p->>'creation_key','') is not null and exists(select 1 from requests where creation_key=(p->>'creation_key')::uuid) then raise exception 'This request was already saved. Open it from the request register.'; end if;
 insert into requests(creation_key,fiscal_year_id,department_id,project_id,request_type_id,requester_user_id,title,purpose,amount,relevant_date,notes,source_folder_url,source_folder_id) values(nullif(p->>'creation_key','')::uuid,y,d,nullif(p->>'project_id','')::uuid,rt.id,actor,trim(p->>'title'),p->>'title',amt,nullif(p->>'relevant_date','')::date,notes,p->>'source_folder_url',p->>'source_folder_id') returning id into rid;
 insert into request_status_history(request_id,to_status,changed_by) values(rid,'DRAFT',actor);
 end if;
 if command='SUBMIT_REQUEST' then
 if nullif(p->>'source_folder_id','') is null then raise exception 'A validated Drive folder is required.'; end if;
 update fiscal_years set next_sequence=next_sequence+1 where id=y returning jsonb_build_object('code',code,'sequence',next_sequence) into result;
 update requests set reference_code=coalesce(reference_code,'AEA-'||(result->>'code')||'-'||lpad(result->>'sequence',4,'0')),status='SUBMITTED',submitted_at=now(),drive_copy_status='PENDING',drive_error_message=null,archive_batch=gen_random_uuid() where id=rid;
 delete from request_document_checks where request_id=rid;
 insert into request_status_history(request_id,from_status,to_status,changed_by,notes) values(rid,coalesce(r.status,'DRAFT'),'SUBMITTED',actor,notes);
 end if;
 select to_jsonb(requests.*) into result from requests where id=rid;
 elsif command='TRANSITION' then
 select * into r from requests where id=(p->>'id')::uuid for update;
 if r.id is null then raise exception 'Request not found.'; end if;
 y:=r.fiscal_year_id; d:=r.department_id; rid:=r.id; prior:=to_jsonb(r); rr:=assert_actor(actor,y,d);
 target:=(p->>'status')::request_status;
 select * into rt from request_types where id=r.request_type_id;
 if target in ('APPROVED','REJECTED','NEEDS_REVISION','PROCESSING','COMPLETED') and rr<>'CFO_ADMIN' then raise exception 'Only CFO can make this decision.'; end if;
 if target in ('UNDER_OCFO_REVIEW','READY_FOR_CFO') and rr not in ('CFO_ADMIN','OCFO_MEMBER') then raise exception 'Finance review access required.'; end if;
 if target='CANCELLED' and (r.status not in ('DRAFT','SUBMITTED','NEEDS_REVISION') or rr='PROJECT_MEMBER') and rr<>'CFO_ADMIN' then raise exception 'CFO cancellation required at this stage.'; end if;
 if r.status in ('COMPLETED','REJECTED','CANCELLED') then raise exception 'Terminal requests are locked.'; end if;
 if not ((target='UNDER_OCFO_REVIEW' and r.status='SUBMITTED') or (target='READY_FOR_CFO' and r.status in ('SUBMITTED','UNDER_OCFO_REVIEW')) or (target in ('APPROVED','REJECTED','NEEDS_REVISION') and r.status in ('SUBMITTED','UNDER_OCFO_REVIEW','READY_FOR_CFO')) or (target='PROCESSING' and r.status='APPROVED') or (target='COMPLETED' and r.status in ('APPROVED','PROCESSING')) or target='CANCELLED') then
 if rr<>'CFO_ADMIN' or notes is null then raise exception 'Invalid transition; CFO override requires a reason.'; end if;
 end if;
 if target in ('REJECTED','NEEDS_REVISION','CANCELLED') and notes is null then raise exception 'Please provide a reason.'; end if;
 if target='APPROVED' then
 if r.approved_at is not null then raise exception 'This request has already been approved.'; end if;
 -- Serialize all budget-changing actions for a department/year.
 perform pg_advisory_xact_lock(hashtextextended(y::text||d::text,0));
 select available_funds into before_available from department_financials where fiscal_year_id=y and department_id=d;
 if r.drive_copy_status<>'COPIED' and notes is null then raise exception 'Official documents have not been archived; override reason required.'; end if;
 for req in select * from document_requirements where request_type_id=rt.id and is_required and (condition_type is null or (condition_type='AMOUNT_LT' and r.amount < (condition_json->>'amount')::numeric)) loop
 if not exists(select 1 from request_document_checks where request_id=rid and document_requirement_id=req.id and is_verified) and notes is null then raise exception 'Verify every required document or enter an override reason.'; end if;
 end loop;
 if rt.creates_commitment and (coalesce(before_available,0)-r.amount<0) and notes is null then raise exception 'Approval exceeds available funds. CFO override reason required.'; end if;
 insert into approvals(request_id,approver_user_id,decision,notes) values(rid,actor,'APPROVED',notes);
 if rt.code in ('BUDGET_REQUEST','BUDGET_CHANGE') then
 insert into department_budgets(fiscal_year_id,department_id) values(y,d) on conflict do nothing;
 if rt.code='BUDGET_REQUEST' then
 if exists(select 1 from department_budgets where fiscal_year_id=y and department_id=d and initial_approved_budget<>0) or exists(select 1 from budget_adjustments where fiscal_year_id=y and department_id=d) then raise exception 'A budget is already established. Submit a budget change instead.'; end if;
 update department_budgets set initial_approved_budget=r.amount,notes=r.title where fiscal_year_id=y and department_id=d;
 else
 insert into budget_adjustments(fiscal_year_id,department_id,request_id,amount_delta,type,reason,approved_by) values(y,d,rid,r.amount,rt.code,coalesce(notes,r.title),actor);
 end if;
 target:='COMPLETED';
 elsif rt.creates_commitment then
 insert into commitments(request_id,fiscal_year_id,department_id,original_amount,remaining_amount,status) values(rid,y,d,r.amount,r.amount,'ACTIVE') on conflict(request_id) do update set remaining_amount=excluded.remaining_amount,status='ACTIVE';
 end if;
 if rt.creates_commitment and coalesce(before_available,0)-r.amount<0 then insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,'NEGATIVE_AVAILABLE_FUNDS','CRITICAL','requests',rid,'CFO approved beyond available funds: '||notes) on conflict do nothing; end if;
 elsif target in ('REJECTED','NEEDS_REVISION') then
 insert into approvals(request_id,approver_user_id,decision,notes) values(rid,actor,case when target='REJECTED' then 'REJECTED' else 'RETURNED' end,notes);
 end if;
 if target='COMPLETED' and rt.creates_commitment then
 select coalesce(sum(amount),0) into expense_total from transactions where request_id=rid and type='EXPENSE';
 if expense_total=0 then raise exception 'Record the actual expense before completing this request.'; end if;
 if exists(select 1 from discrepancies where entity_id=rid and status='OPEN' and severity='CRITICAL') and notes is null then raise exception 'Resolve critical discrepancies or provide a CFO override reason.'; end if;
 update commitments set remaining_amount=0,status=case when expense_total>=original_amount then 'FULFILLED' else 'RELEASED' end,released_at=now() where request_id=rid;
 elsif target in ('CANCELLED','REJECTED','NEEDS_REVISION') then
 update commitments set remaining_amount=0,status='CANCELLED',released_at=now() where request_id=rid;
 end if;
 update requests set status=target,approved_at=case when p->>'status'='APPROVED' then now() else approved_at end,completed_at=case when target='COMPLETED' then now() else completed_at end,cancelled_at=case when target='CANCELLED' then now() else cancelled_at end,updated_at=now() where id=rid;
 insert into request_status_history(request_id,from_status,to_status,changed_by,notes) values(rid,r.status,target,actor,notes);
 select to_jsonb(requests.*) into result from requests where id=rid;
 elsif command='TRANSACTION' then
 y:=(p->>'fiscal_year_id')::uuid; d:=(p->>'department_id')::uuid; rr:=assert_actor(actor,y,d,false,true);
 if rr='OCFO_MEMBER' and not coalesce((select (value #>> '{}')::boolean from organization_settings where key='ocfo_can_record_transactions'),false) then raise exception 'CFO has not enabled OCFO transaction recording.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(y::text||d::text,0));
 amt:=(p->>'amount')::numeric(14,2); if amt<=0 then raise exception 'Amount must be positive.'; end if;
 if p->>'type' not in ('EXPENSE','REVENUE') then raise exception 'Invalid transaction type.'; end if;
 if not exists(select 1 from fiscal_years where id=y and (p->>'transaction_date')::date between start_date and end_date) then raise exception 'Transaction date is outside the fiscal year.'; end if;
 rid:=nullif(p->>'request_id','')::uuid;
 if rid is not null then
 select * into r from requests where id=rid for update;
 if r.id is null or r.fiscal_year_id<>y or r.department_id<>d or r.status not in ('APPROVED','PROCESSING') or r.project_id is distinct from nullif(p->>'project_id','')::uuid then raise exception 'Transaction must match an approved request department, year, and project.'; end if;
 select * into rt from request_types where id=r.request_type_id;
 if (p->>'type'='EXPENSE' and not rt.creates_commitment) or (p->>'type'='REVENUE' and rt.code<>'PROJECT_END_REVENUE') then raise exception 'Transaction type does not match this request.'; end if;
 elsif not coalesce((select (value #>> '{}')::boolean from organization_settings where key='allow_unlinked_transactions'),false) then raise exception 'An approved request is required by current policy.';
 end if;
 if nullif(p->>'project_id','') is not null and not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=d) then raise exception 'Invalid project scope.'; end if;
 if exists(select 1 from transactions where idempotency_key=(p->>'idempotency_key')::uuid) then raise exception 'This transaction has already been recorded.'; end if;
 insert into transactions(fiscal_year_id,department_id,project_id,request_id,type,amount,transaction_date,description,created_by,idempotency_key) values(y,d,nullif(p->>'project_id','')::uuid,rid,p->>'type',amt,(p->>'transaction_date')::date,p->>'description',actor,(p->>'idempotency_key')::uuid) returning to_jsonb(transactions.*) into result;
 if p->>'type'='EXPENSE' and rid is not null then
 select coalesce(sum(amount),0) into expense_total from transactions where request_id=rid and type='EXPENSE';
 update commitments set remaining_amount=greatest(original_amount-expense_total,0),status=case when expense_total>=original_amount then 'FULFILLED' else 'ACTIVE' end where request_id=rid;
 if expense_total>r.amount then insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,'ACTUAL_EXCEEDS_APPROVED','CRITICAL','requests',rid,'Actual expense exceeds approved request amount.') on conflict do nothing; end if;
 end if;
 select available_funds into before_available from department_financials where fiscal_year_id=y and department_id=d;
 if before_available<0 then insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,'NEGATIVE_AVAILABLE_FUNDS','CRITICAL','departments',d,'Department available funds are negative.') on conflict do nothing; end if;
 elsif command='VERIFY_TRANSACTION' then
 select fiscal_year_id,department_id into y,d from transactions where id=(p->>'id')::uuid;rr:=assert_actor(actor,y,d,false,true);
 if rr='OCFO_MEMBER' and not coalesce((select (value #>> '{}')::boolean from organization_settings where key='ocfo_can_record_transactions'),false) then raise exception 'CFO has not enabled OCFO transaction verification.'; end if;
 update transactions set verified_by=actor where id=(p->>'id')::uuid returning to_jsonb(transactions.*) into result;
 elsif command='VERIFY_PROJECT_REPORT' then
 select fiscal_year_id,department_id into y,d from project_reports where id=(p->>'id')::uuid;rr:=assert_actor(actor,y,d,false,true);
 if exists(select 1 from discrepancies where entity_id=(p->>'id')::uuid and status='OPEN' and severity='CRITICAL') then raise exception 'Resolve critical report discrepancies before verification.'; end if;
 update project_reports set status='VERIFIED',verified_at=now() where id=(p->>'id')::uuid returning to_jsonb(project_reports.*) into result;
 elsif command='REVIEW' then
 select * into r from requests where id=(p->>'id')::uuid; y:=r.fiscal_year_id;d:=r.department_id;rid:=r.id;rr:=assert_actor(actor,y,d,false,true);
 if r.status not in ('SUBMITTED','UNDER_OCFO_REVIEW','READY_FOR_CFO') then raise exception 'Request is not open for review.'; end if;
 insert into request_reviews(request_id,reviewer_user_id,review_status,recommendation,comments) values(rid,actor,p->>'review_status',p->>'recommendation',notes) on conflict(request_id,reviewer_user_id) do update set review_status=excluded.review_status,recommendation=excluded.recommendation,comments=excluded.comments,reviewed_at=now();
 result:=jsonb_build_object('id',rid);
 elsif command='COMMENT' then
 select * into r from requests where id=(p->>'id')::uuid; y:=r.fiscal_year_id;d:=r.department_id;rid:=r.id;rr:=assert_actor(actor,y,d);
 if p->>'visibility'='INTERNAL_OCFO' and rr not in ('CFO_ADMIN','OCFO_MEMBER') then raise exception 'Internal comment permission denied.'; end if;
 if notes is null then raise exception 'Comment cannot be empty.'; end if;
 insert into request_comments(request_id,author_user_id,visibility,body) values(rid,actor,p->>'visibility',notes);result:=jsonb_build_object('id',rid);
 elsif command='VERIFY_DOCUMENT' then
 select * into r from requests where id=(p->>'id')::uuid; y:=r.fiscal_year_id;d:=r.department_id;rid:=r.id;rr:=assert_actor(actor,y,d,false,true);
 if r.status not in ('SUBMITTED','UNDER_OCFO_REVIEW','READY_FOR_CFO','NEEDS_REVISION') then raise exception 'Document verification is locked at this stage.'; end if;
 if not exists(select 1 from document_requirements where id=(p->>'requirement_id')::uuid and request_type_id=r.request_type_id) then raise exception 'Invalid document requirement.'; end if;
 insert into request_document_checks(request_id,document_requirement_id,verified_by,is_verified) values(rid,(p->>'requirement_id')::uuid,actor,(p->>'is_verified')::boolean) on conflict(request_id,document_requirement_id) do update set is_verified=excluded.is_verified,verified_by=actor,verified_at=now();
 if not (p->>'is_verified')::boolean then insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,'MISSING_DOCUMENT_'||(p->>'requirement_id'),'HIGH','requests',rid,'A mandatory document is missing or invalid.') on conflict do nothing;
 else update discrepancies set status='RESOLVED',resolved_at=now(),resolved_by=actor,resolution_notes='Document verified.' where entity_id=rid and code='MISSING_DOCUMENT_'||(p->>'requirement_id') and status='OPEN'; end if;
 result:=jsonb_build_object('id',rid);
 elsif command='RESOLVE_ISSUE' then
 select fiscal_year_id,department_id into y,d from discrepancies where id=(p->>'id')::uuid;rr:=assert_actor(actor,y,d,true);
 if notes is null then raise exception 'Resolution notes required.'; end if;
 update discrepancies set status=p->>'status',resolved_at=now(),resolved_by=actor,resolution_notes=notes where id=(p->>'id')::uuid and status='OPEN';result:=p;
 elsif command='FLAG_ISSUE' then
 select * into r from requests where id=(p->>'id')::uuid;y:=r.fiscal_year_id;d:=r.department_id;rr:=assert_actor(actor,y,d,false,true);
 insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,p->>'code',p->>'severity','requests',r.id,notes) on conflict do nothing;result:=p;
 elsif command='PROJECT_REPORT' then
 y:=(p->>'fiscal_year_id')::uuid;d:=(p->>'department_id')::uuid;rr:=assert_actor(actor,y,d);
 if not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=d) then raise exception 'Invalid project scope.'; end if;
 if not exists(select 1 from requests where id=(p->>'request_id')::uuid and fiscal_year_id=y and department_id=d and project_id=(p->>'project_id')::uuid and request_type_id=(select id from request_types where code='PROJECT_END_REVENUE')) then raise exception 'Link a project-end/revenue request for this project and department.'; end if;
 insert into project_reports(project_id,fiscal_year_id,department_id,request_id,total_expenses,total_revenue,variance) values((p->>'project_id')::uuid,y,d,(p->>'request_id')::uuid,(p->>'total_expenses')::numeric,(p->>'total_revenue')::numeric,(p->>'variance')::numeric) returning to_jsonb(project_reports.*) into result;
 select coalesce(sum(amount) filter(where type='EXPENSE'),0),coalesce(sum(amount) filter(where type='REVENUE'),0) into expense_total,amt from transactions where project_id=(p->>'project_id')::uuid and department_id=d and fiscal_year_id=y;
 if expense_total<>(p->>'total_expenses')::numeric or amt<>(p->>'total_revenue')::numeric then insert into discrepancies(fiscal_year_id,department_id,code,severity,entity_type,entity_id,description) values(y,d,'PROJECT_TOTALS_MISMATCH','CRITICAL','project_reports',(result->>'id')::uuid,'Project report totals do not reconcile with the expense/revenue ledger.'); end if;
 else raise exception 'Unknown command.';
 end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data,metadata) values(actor,command,case when command in ('TRANSACTION','VERIFY_TRANSACTION') then 'transactions' when command in ('PROJECT_REPORT','VERIFY_PROJECT_REPORT') then 'project_reports' else 'requests' end,coalesce((result->>'id')::uuid,rid),y,d,prior,result,jsonb_build_object('reason',notes));
 return result;
end $$;
revoke all on function public.assert_actor(uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.finance_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_command(uuid,text,jsonb) to service_role;

-- Admin configuration changes are atomic and audit logged, including privilege changes.
create function public.admin_command(actor uuid,command text,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare y uuid; active_y uuid; d uuid; new_id uuid; prior jsonb; result jsonb; rr finance_role; begin
 select id into active_y from fiscal_years where is_active;
 select department_id into d from memberships m join users u on lower(u.email)=lower(m.email) where u.id=actor and m.fiscal_year_id=active_y and m.is_active and m.role='CFO_ADMIN' limit 1;
 -- Closing is allowed from the active admin membership; closed years never grant mutation.
 if d is null then raise exception 'CFO admin access required.'; end if;
 rr:=assert_actor(actor,active_y,d,true);y:=coalesce(nullif(p->>'fiscal_year_id','')::uuid,active_y);
 if command='CREATE_YEAR' then
 insert into fiscal_years(label,code,start_date,end_date) values(p->>'label',p->>'code',(p->>'start_date')::date,(p->>'end_date')::date) returning id into new_id;
 insert into department_budgets(fiscal_year_id,department_id) select new_id,id from departments where is_active;
 if coalesce((p->>'copy_config')::boolean,false) then insert into faq_guides(fiscal_year_id,title,slug,content,display_order,is_published,updated_by) select new_id,title,slug,content,display_order,is_published,actor from faq_guides where fiscal_year_id=active_y; end if;
 result:=jsonb_build_object('id',new_id);
 elsif command='ACTIVATE_YEAR' then
 perform pg_advisory_xact_lock(73191);
 if not exists(select 1 from fiscal_years where id=y and not is_closed) then raise exception 'Choose an open fiscal year.'; end if;
 if not exists(select 1 from memberships where fiscal_year_id=y and is_active and role='CFO_ADMIN') then raise exception 'Assign a succeeding CFO before activating the year.'; end if;
 update fiscal_years set is_active=false where is_active;update fiscal_years set is_active=true where id=y;result:=p;
 elsif command='CLOSE_YEAR' then
 if y=active_y then raise exception 'Activate the succeeding year before closing this year.'; end if;
 if exists(select 1 from commitments where fiscal_year_id=y and status='ACTIVE' and remaining_amount>0) or exists(select 1 from requests where fiscal_year_id=y and status not in ('COMPLETED','REJECTED','CANCELLED')) or exists(select 1 from discrepancies where fiscal_year_id=y and status='OPEN' and severity='CRITICAL') then raise exception 'Resolve open requests, commitments, and critical discrepancies before closing.'; end if;
 update fiscal_years set is_closed=true,closed_at=now() where id=y;result:=p;
 elsif command='MEMBERSHIP' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if split_part(lower(p->>'email'),'@',2)<>coalesce((select value #>> '{}' from organization_settings where key='allowed_email_domain'),'student.ateneo.edu') then raise exception 'Membership email must use the allowed domain.'; end if;
 select to_jsonb(m.*) into prior from memberships m where lower(email)=lower(p->>'email') and fiscal_year_id=y and department_id=(p->>'department_id')::uuid;
 if exists(select 1 from memberships m join users u on lower(m.email)=lower(u.email) where u.id=actor and m.fiscal_year_id=active_y and m.department_id=(p->>'department_id')::uuid and m.role='CFO_ADMIN') and (p->>'role'<>'CFO_ADMIN' or not (p->>'is_active')::boolean) and (select count(*) from memberships where fiscal_year_id=active_y and role='CFO_ADMIN' and is_active)<=1 then raise exception 'Cannot remove the last active CFO.'; end if;
 insert into memberships(email,user_id,fiscal_year_id,department_id,role,is_active) values(lower(p->>'email'),(select id from users where lower(email)=lower(p->>'email')),y,(p->>'department_id')::uuid,(p->>'role')::finance_role,(p->>'is_active')::boolean) on conflict(email,fiscal_year_id,department_id) do update set role=excluded.role,is_active=excluded.is_active,user_id=excluded.user_id returning to_jsonb(memberships.*) into result;
 elsif command='PROJECT' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 new_id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
 insert into projects(id,fiscal_year_id,name,description,start_date,end_date,status,created_by) values(new_id,y,p->>'name',p->>'description',nullif(p->>'start_date','')::date,nullif(p->>'end_date','')::date,p->>'status',actor) on conflict(id) do update set name=excluded.name,description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status where projects.fiscal_year_id=y;
 delete from project_departments where project_id=new_id;
 insert into project_departments(project_id,department_id) select new_id,value::uuid from jsonb_array_elements_text(p->'department_ids');result:=jsonb_build_object('id',new_id);
 elsif command='PROJECT_MEMBER' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=(p->>'department_id')::uuid) then raise exception 'Project department mismatch.'; end if;
 insert into project_members(project_id,user_id,department_id) values((p->>'project_id')::uuid,(p->>'user_id')::uuid,(p->>'department_id')::uuid) on conflict(project_id,user_id) do update set department_id=excluded.department_id;result:=p;
 elsif command='DEPARTMENT' then
 insert into departments(code,name,is_active) values(p->>'code',p->>'name',(p->>'is_active')::boolean) on conflict(code) do update set name=excluded.name,is_active=excluded.is_active returning to_jsonb(departments.*) into result;
 elsif command='SETTING' then
 select to_jsonb(s.*) into prior from organization_settings s where key=p->>'key';
 insert into organization_settings(key,value) values(p->>'key',p->'value') on conflict(key) do update set value=excluded.value;result:=p;
 elsif command='REQUEST_TYPE' then
 update request_types set name=p->>'name',description=p->>'description',is_active=(p->>'is_active')::boolean,creates_commitment=(p->>'creates_commitment')::boolean,process_config=coalesce(p->'process_config','{}') where id=(p->>'id')::uuid;result:=p;
 elsif command='REQUIREMENT' then
 insert into document_requirements(request_type_id,document_code,label,is_required,condition_type,condition_json,display_order,template_url) values((p->>'request_type_id')::uuid,p->>'document_code',p->>'label',(p->>'is_required')::boolean,nullif(p->>'condition_type',''),p->'condition_json',coalesce((p->>'display_order')::integer,0),nullif(p->>'template_url','')) on conflict(request_type_id,document_code) do update set label=excluded.label,is_required=excluded.is_required,condition_type=excluded.condition_type,condition_json=excluded.condition_json,display_order=excluded.display_order,template_url=excluded.template_url;result:=p;
 else raise exception 'Unknown admin command.'; end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data) values(actor,command,'admin',null,active_y,d,prior,result);return result;
end $$;
revoke all on function public.admin_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_command(uuid,text,jsonb) to service_role;
commit;

begin;
insert into public.departments(code,name) values ('OP','Office of the President'),('OSG','Office of the Secretary General'),('OCFO','Office of the Chief Financial Officer'),('ACADS','Academics'),('CREA','Creatives'),('ExRel','External Relations'),('HR','Human Resources'),('RND','Research and Development') on conflict(code) do nothing;
insert into public.request_types(code,name,creates_commitment) values ('BUDGET_REQUEST','Budget request',false),('BUDGET_CHANGE','Budget change',false),('DISBURSEMENT_ACCREDITED','Accredited disbursement',true),('DISBURSEMENT_UNACCREDITED','Unaccredited disbursement',true),('REIMBURSEMENT','Reimbursement',true),('BUDGET_TRANSFER','Budget transfer / inter-unit charging',true),('PROJECT_END_REVENUE','Project-end / revenue submission',false) on conflict(code) do nothing;
insert into public.document_requirements(request_type_id,document_code,label,display_order,condition_type,condition_json)
select t.id,v.code,v.label,v.n,v.condition,case when v.condition='AMOUNT_LT' then '{"amount":15000}'::jsonb else null end
from public.request_types t cross join (values
 ('BUDGET_REQUEST','LETTER','Budget Request Letter',1,null),('BUDGET_REQUEST','BREAKDOWN','Budget Breakdown',2,null),
 ('BUDGET_CHANGE','LETTER','Budget Change Letter',1,null),('BUDGET_CHANGE','BREAKDOWN','Budget Breakdown',2,null),
 ('DISBURSEMENT_ACCREDITED','PPF','Project Proposal Form (PPF)',1,null),('DISBURSEMENT_ACCREDITED','INVOICE','Invoice',2,null),('DISBURSEMENT_ACCREDITED','PROOF','Proof of Purchase / Documentation',3,null),('DISBURSEMENT_ACCREDITED','PARTICIPANTS','List of Participants',4,null),('DISBURSEMENT_ACCREDITED','PDAF','PDAF',5,'AMOUNT_LT'),
 ('DISBURSEMENT_UNACCREDITED','PPF','Project Proposal Form (PPF)',1,null),('DISBURSEMENT_UNACCREDITED','INVOICE','Invoice',2,null),('DISBURSEMENT_UNACCREDITED','PROOF','Proof of Purchase / Documentation',3,null),('DISBURSEMENT_UNACCREDITED','PARTICIPANTS','List of Participants',4,null),('DISBURSEMENT_UNACCREDITED','PDAF','PDAF',5,'AMOUNT_LT'),('DISBURSEMENT_UNACCREDITED','ID','Valid ID',6,null),('DISBURSEMENT_UNACCREDITED','BANK','Bank Proof: name, account number, and bank name in one document',7,null),('DISBURSEMENT_UNACCREDITED','ADC','ADC Form',8,null),
 ('REIMBURSEMENT','PPF','Project Proposal Form (PPF)',1,null),('REIMBURSEMENT','INVOICE','Invoice',2,null),('REIMBURSEMENT','PROOF','Proof of Purchase / Documentation',3,null),('REIMBURSEMENT','PARTICIPANTS','List of Participants',4,null),('REIMBURSEMENT','PDAF','PDAF',5,'AMOUNT_LT'),('REIMBURSEMENT','ID','Valid ID',6,null),('REIMBURSEMENT','BANK','Bank Proof: name, account number, and bank name in one document',7,null),('REIMBURSEMENT','ADC','ADC Form',8,null),
 ('BUDGET_TRANSFER','LETTER','Budget Transfer Letter',1,null),('BUDGET_TRANSFER','SOA','Billing Statement / Statement of Account (SOA)',2,null),
 ('PROJECT_END_REVENUE','TURNOVER','Turnover Report',1,null),('PROJECT_END_REVENUE','VARIANCE','Variance Analysis Report',2,null),('PROJECT_END_REVENUE','REVENUE','Revenue/Budget Turnover',3,null)
) as v(type,code,label,n,condition) where t.code=v.type on conflict(request_type_id,document_code) do nothing;
insert into public.organization_settings(key,value) values
 ('allowed_email_domain','"student.ateneo.edu"'),('finance_notification_email','"aea.college.org@student.ateneo.edu"'),('google_drive_root_folder_id','"134YLUX7vHeA25cg5rXMzwZULIvZmyn_u"'),
 ('ocfo_can_record_transactions','false'),('allow_unlinked_transactions','false'),('report_due_days','7'),('reminder_days','3'),('unprocessed_warning_days','14'),('long_open_warning_days','30'),('notification_recipients','[]'),('workflow_overrides','{}') on conflict(key) do nothing;
insert into public.faq_guides(title,slug,content,display_order) select * from (values
 ('How do I submit a finance request?','submit','Prepare the required documents in a Google Drive folder. Share the folder with the finance integration account shown on the request form. Choose your department and request type, enter the minimum metadata, validate the folder, then submit. Your official copies and reference number will appear on the request detail page.',1),
 ('How are available funds calculated?','funds','Available funds = current approved department budget âˆ’ actual expenses âˆ’ active commitments. Revenue is tracked separately. Projects do not have independent budgets.',2),
 ('When is PDAF required?','pdaf','PDAF is required for accredited disbursement, unaccredited disbursement, and reimbursement when the amount is strictly below PHP 15,000. At PHP 15,000 or above, this conditional requirement does not apply.',3),
 ('How do revisions work?','revisions','When the CFO returns a request, edit its metadata and source folder, then resubmit. Previous official files, comments, approvals, and status history remain available. Internal OCFO comments are visible only to finance officers.',4)
) v(title,slug,content,display_order) where not exists(select 1 from public.faq_guides f where f.slug=v.slug and f.fiscal_year_id is null);
commit;


-- Run once in Supabase SQL Editor for an existing installation.
-- Preserves project access rules while avoiding recursive RLS evaluation.
begin;

create or replace function public.can_read_project(project_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = project_uuid and (
      public.is_finance(p.fiscal_year_id) or exists (
        select 1 from public.project_departments pd
        where pd.project_id = p.id
          and public.has_access(p.fiscal_year_id, pd.department_id)
      )
    )
  );
$$;

create or replace function public.can_read_project_department(project_uuid uuid, department_uuid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = project_uuid
      and public.has_access(p.fiscal_year_id, department_uuid)
  );
$$;

revoke all on function public.can_read_project(uuid) from public, anon;
revoke all on function public.can_read_project_department(uuid, uuid) from public, anon;
grant execute on function public.can_read_project(uuid) to authenticated, service_role;
grant execute on function public.can_read_project_department(uuid, uuid) to authenticated, service_role;

alter policy projects_read on public.projects
  using (public.can_read_project(id));
alter policy project_depts_read on public.project_departments
  using (public.can_read_project_department(project_id, department_id));
alter policy project_members_read on public.project_members
  using (public.can_read_project_department(project_id, department_id));

commit;

-- Existing databases: run this migration only, after migrations 001 and 002.
-- Gmail accounts still require an active membership with their exact email.
begin;
create or replace function public.email_domain_allowed(email text) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(email ~ '^[^@[:space:]]+@[^@[:space:]]+$' and
  split_part(lower(email),'@',2) in ('gmail.com', lower(trim(coalesce(
   (select value #>> '{}' from organization_settings where key='allowed_email_domain'),
   'student.ateneo.edu')))), false);
$$;
revoke all on function public.email_domain_allowed(text) from public,anon;
grant execute on function public.email_domain_allowed(text) to authenticated,service_role;

create or replace function public.has_access(y uuid, d uuid default null) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships m where lower(m.email)=lower(auth.jwt()->>'email') and m.is_active and ((m.fiscal_year_id=y and (m.role in ('CFO_ADMIN','OCFO_MEMBER') or (m.department_id=d and m.role='DEPARTMENT_MEMBER'))) or (m.role in ('CFO_ADMIN','OCFO_MEMBER') and exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active))) and exists(select 1 from memberships a join fiscal_years f on f.id=a.fiscal_year_id where f.is_active and a.is_active and lower(a.email)=lower(auth.jwt()->>'email')) and public.email_domain_allowed(auth.jwt()->>'email'));
$$;

create or replace function public.assert_actor(actor uuid,y uuid,d uuid,admin_only boolean default false,finance_only boolean default false) returns public.finance_role language plpgsql security definer set search_path=public as $$
declare rr finance_role; begin
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'This fiscal year is closed and read-only.'; end if;
 if not exists(select 1 from users u join memberships m on lower(m.email)=lower(u.email) join fiscal_years f on f.id=m.fiscal_year_id where u.id=actor and f.is_active and m.is_active and public.email_domain_allowed(u.email)) then raise exception 'No active membership.'; end if;
 select m.role into rr from memberships m join users u on lower(u.email)=lower(m.email) where u.id=actor and (m.fiscal_year_id=y or (m.role in ('CFO_ADMIN','OCFO_MEMBER') and exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active))) and m.is_active and ((m.department_id=d and m.role='DEPARTMENT_MEMBER') or m.role in ('CFO_ADMIN','OCFO_MEMBER')) order by case m.role when 'CFO_ADMIN' then 0 when 'OCFO_MEMBER' then 1 else 2 end limit 1;
 if rr is null or (admin_only and rr <> 'CFO_ADMIN') or (finance_only and rr not in ('CFO_ADMIN','OCFO_MEMBER')) then raise exception 'Permission denied.'; end if;
 return rr;
end $$;

create or replace function public.admin_command(actor uuid,command text,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare y uuid; active_y uuid; d uuid; new_id uuid; prior jsonb; result jsonb; rr finance_role; begin
 select id into active_y from fiscal_years where is_active;
 select department_id into d from memberships m join users u on lower(u.email)=lower(m.email) where u.id=actor and m.fiscal_year_id=active_y and m.is_active and m.role='CFO_ADMIN' limit 1;
 -- Closing is allowed from the active admin membership; closed years never grant mutation.
 if d is null then raise exception 'CFO admin access required.'; end if;
 rr:=assert_actor(actor,active_y,d,true);y:=coalesce(nullif(p->>'fiscal_year_id','')::uuid,active_y);
 if command='CREATE_YEAR' then
 insert into fiscal_years(label,code,start_date,end_date) values(p->>'label',p->>'code',(p->>'start_date')::date,(p->>'end_date')::date) returning id into new_id;
 insert into department_budgets(fiscal_year_id,department_id) select new_id,id from departments where is_active;
 if coalesce((p->>'copy_config')::boolean,false) then insert into faq_guides(fiscal_year_id,title,slug,content,display_order,is_published,updated_by) select new_id,title,slug,content,display_order,is_published,actor from faq_guides where fiscal_year_id=active_y; end if;
 result:=jsonb_build_object('id',new_id);
 elsif command='ACTIVATE_YEAR' then
 perform pg_advisory_xact_lock(73191);
 if not exists(select 1 from fiscal_years where id=y and not is_closed) then raise exception 'Choose an open fiscal year.'; end if;
 if not exists(select 1 from memberships where fiscal_year_id=y and is_active and role='CFO_ADMIN') then raise exception 'Assign a succeeding CFO before activating the year.'; end if;
 update fiscal_years set is_active=false where is_active;update fiscal_years set is_active=true where id=y;result:=p;
 elsif command='CLOSE_YEAR' then
 if y=active_y then raise exception 'Activate the succeeding year before closing this year.'; end if;
 if exists(select 1 from commitments where fiscal_year_id=y and status='ACTIVE' and remaining_amount>0) or exists(select 1 from requests where fiscal_year_id=y and status not in ('COMPLETED','REJECTED','CANCELLED')) or exists(select 1 from discrepancies where fiscal_year_id=y and status='OPEN' and severity='CRITICAL') then raise exception 'Resolve open requests, commitments, and critical discrepancies before closing.'; end if;
 update fiscal_years set is_closed=true,closed_at=now() where id=y;result:=p;
 elsif command='MEMBERSHIP' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not public.email_domain_allowed(p->>'email') then raise exception 'Membership email must use the configured organization domain or gmail.com.'; end if;
 select to_jsonb(m.*) into prior from memberships m where lower(email)=lower(p->>'email') and fiscal_year_id=y and department_id=(p->>'department_id')::uuid;
 if y=active_y and exists(select 1 from memberships m where lower(m.email)=lower(p->>'email') and m.fiscal_year_id=active_y and m.department_id=(p->>'department_id')::uuid and m.role='CFO_ADMIN' and m.is_active) and (p->>'role'<>'CFO_ADMIN' or not (p->>'is_active')::boolean) and (select count(*) from memberships where fiscal_year_id=active_y and role='CFO_ADMIN' and is_active)<=1 then raise exception 'Cannot remove the last active CFO.'; end if;
 insert into memberships(email,user_id,fiscal_year_id,department_id,role,is_active) values(lower(p->>'email'),(select id from users where lower(email)=lower(p->>'email')),y,(p->>'department_id')::uuid,(p->>'role')::finance_role,(p->>'is_active')::boolean) on conflict(email,fiscal_year_id,department_id) do update set role=excluded.role,is_active=excluded.is_active,user_id=excluded.user_id returning to_jsonb(memberships.*) into result;
 elsif command='PROJECT' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 new_id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
 insert into projects(id,fiscal_year_id,name,description,start_date,end_date,status,created_by) values(new_id,y,p->>'name',p->>'description',nullif(p->>'start_date','')::date,nullif(p->>'end_date','')::date,p->>'status',actor) on conflict(id) do update set name=excluded.name,description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status where projects.fiscal_year_id=y;
 delete from project_departments where project_id=new_id;
 insert into project_departments(project_id,department_id) select new_id,value::uuid from jsonb_array_elements_text(p->'department_ids');result:=jsonb_build_object('id',new_id);
 elsif command='PROJECT_MEMBER' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=(p->>'department_id')::uuid) then raise exception 'Project department mismatch.'; end if;
 insert into project_members(project_id,user_id,department_id) values((p->>'project_id')::uuid,(p->>'user_id')::uuid,(p->>'department_id')::uuid) on conflict(project_id,user_id) do update set department_id=excluded.department_id;result:=p;
 elsif command='DEPARTMENT' then
 insert into departments(code,name,is_active) values(p->>'code',p->>'name',(p->>'is_active')::boolean) on conflict(code) do update set name=excluded.name,is_active=excluded.is_active returning to_jsonb(departments.*) into result;
 elsif command='SETTING' then
 select to_jsonb(s.*) into prior from organization_settings s where key=p->>'key';
 insert into organization_settings(key,value) values(p->>'key',p->'value') on conflict(key) do update set value=excluded.value;result:=p;
 elsif command='REQUEST_TYPE' then
 update request_types set name=p->>'name',description=p->>'description',is_active=(p->>'is_active')::boolean,creates_commitment=(p->>'creates_commitment')::boolean,process_config=coalesce(p->'process_config','{}') where id=(p->>'id')::uuid;result:=p;
 elsif command='REQUIREMENT' then
 insert into document_requirements(request_type_id,document_code,label,is_required,condition_type,condition_json,display_order,template_url) values((p->>'request_type_id')::uuid,p->>'document_code',p->>'label',(p->>'is_required')::boolean,nullif(p->>'condition_type',''),p->'condition_json',coalesce((p->>'display_order')::integer,0),nullif(p->>'template_url','')) on conflict(request_type_id,document_code) do update set label=excluded.label,is_required=excluded.is_required,condition_type=excluded.condition_type,condition_json=excluded.condition_json,display_order=excluded.display_order,template_url=excluded.template_url;result:=p;
 else raise exception 'Unknown admin command.'; end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data) values(actor,command,'admin',null,active_y,d,prior,result);return result;
end $$;
commit;

-- Additive portal refactor. Apply after migrations 001-003; safe to reapply.
begin;
create or replace function public.member_department(member_email text, y uuid) returns uuid
language sql stable security definer set search_path=public as $$
 select department_id from memberships where lower(email)=lower(member_email)
 and fiscal_year_id=y and is_active and role='DEPARTMENT_MEMBER' order by id limit 1;
$$;
revoke all on function public.member_department(text,uuid) from public,anon,authenticated;
grant execute on function public.member_department(text,uuid) to service_role;

-- Narrow legacy multi-department member reads to one primary department.
create or replace function public.has_access(y uuid, d uuid default null) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships m where lower(m.email)=lower(auth.jwt()->>'email') and m.is_active
 and ((m.fiscal_year_id=y and (m.role in ('CFO_ADMIN','OCFO_MEMBER') or
 (m.role='DEPARTMENT_MEMBER' and d=public.member_department(m.email,y))))
 or (m.role in ('CFO_ADMIN','OCFO_MEMBER') and exists(select 1 from fiscal_years f where f.id=m.fiscal_year_id and f.is_active))))
 and exists(select 1 from memberships a join fiscal_years f on f.id=a.fiscal_year_id
 where f.is_active and a.is_active and lower(a.email)=lower(auth.jwt()->>'email'))
 and public.email_domain_allowed(auth.jwt()->>'email');
$$;

-- Preserve the existing atomic finance engine; add authorization ahead of it.
do $$ begin
 if to_regprocedure('public.finance_engine_internal(uuid,text,jsonb)') is null then
  alter function public.finance_command(uuid,text,jsonb) rename to finance_engine_internal;
 end if;
end $$;
revoke all on function public.finance_engine_internal(uuid,text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.finance_command(actor uuid,command text,p jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor_email text; y uuid; begin
 if command in ('SAVE_REQUEST','SUBMIT_REQUEST') then
  select email into actor_email from users where id=actor;
  y:=(p->>'fiscal_year_id')::uuid;
  if exists(select 1 from memberships m join fiscal_years f on f.id=m.fiscal_year_id
   where lower(m.email)=lower(actor_email) and m.is_active and (f.is_active or f.id=y)
   and m.role in ('CFO_ADMIN','OCFO_MEMBER')) then
   raise exception 'Finance Administrator accounts cannot submit financial requests.';
  end if;
  if public.member_department(actor_email,y) is distinct from (p->>'department_id')::uuid then
   raise exception 'Requests must use your registered department. Permission denied.';
  end if;
 end if;
 return public.finance_engine_internal(actor,command,p);
end $$;
revoke all on function public.finance_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.finance_command(uuid,text,jsonb) to service_role;

-- Identity comes from the validated OAuth JWT. No email or role arguments exist.
create or replace function public.register_member(department_id uuid, full_name text, avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); actor_email text:=lower(auth.jwt()->>'email'); y uuid; result jsonb; begin
 if actor is null or actor_email is null or split_part(actor_email,'@',2)<>'student.ateneo.edu'
 or coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' then
  raise exception 'Register using your Ateneo Google account.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
 perform pg_advisory_xact_lock(hashtextextended(actor_email, 1));
 select id into y from fiscal_years where is_active and not is_closed for share;
 if y is null then raise exception 'Registration is unavailable until Finance opens an active fiscal year.'; end if;
 if exists(select 1 from memberships where lower(email)=actor_email) then
  raise exception 'This account already has a membership. Contact Finance to update or restore access.';
 end if;
 if not exists(select 1 from departments d where d.id=register_member.department_id and d.is_active) then
  raise exception 'Choose an active AEA department.';
 end if;
 insert into users(id,email,full_name,avatar_url) values(actor,actor_email,left(trim(register_member.full_name),160),register_member.avatar_url)
 on conflict(id) do update set full_name=excluded.full_name,avatar_url=excluded.avatar_url,updated_at=now();
 insert into memberships(user_id,email,fiscal_year_id,department_id,role)
 values(actor,actor_email,y,register_member.department_id,'DEPARTMENT_MEMBER') returning to_jsonb(memberships.*) into result;
 insert into audit_logs(actor_user_id,action,entity_type,fiscal_year_id,department_id,new_data)
 values(actor,'REGISTER_MEMBER','membership',y,register_member.department_id,result);
 return result;
end $$;
revoke all on function public.register_member(uuid,text,text) from public,anon;
grant execute on function public.register_member(uuid,text,text) to authenticated;

-- Reassign or deactivate in one transaction without deleting historical access.
create or replace function public.manage_registered_user(actor uuid, membership_id uuid, department_id uuid,
 enabled boolean, promote boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare target memberships; prior jsonb; result jsonb; active_y uuid; actor_dept uuid; begin
 select id into active_y from fiscal_years where is_active;
 select m.department_id into actor_dept from memberships m join users u on lower(u.email)=lower(m.email)
 where u.id=actor and m.fiscal_year_id=active_y and m.is_active and m.role='CFO_ADMIN' limit 1;
 perform public.assert_actor(actor,active_y,actor_dept,true);
 if actor_dept is null then raise exception 'Finance Administrator access required.'; end if;
 select * into target from memberships where id=membership_id;
 if target.id is null then raise exception 'Membership not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('membership-admin:'||target.fiscal_year_id::text, 0));
 select * into target from memberships where id=membership_id for update;
 if exists(select 1 from fiscal_years where id=target.fiscal_year_id and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not exists(select 1 from departments d where d.id=manage_registered_user.department_id and d.is_active) then raise exception 'Choose an active department.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target.email, 1));
 select jsonb_agg(to_jsonb(m)) into prior from memberships m where lower(m.email)=lower(target.email) and m.fiscal_year_id=target.fiscal_year_id;
 if exists(select 1 from memberships m where lower(m.email)=lower(target.email) and m.fiscal_year_id=target.fiscal_year_id and m.role in ('CFO_ADMIN','OCFO_MEMBER')) then raise exception 'Use the administrator access form to change Finance privileges.'; end if;
 update memberships m set is_active=false where lower(m.email)=lower(target.email) and m.fiscal_year_id=target.fiscal_year_id and m.role in ('DEPARTMENT_MEMBER','PROJECT_MEMBER');
 insert into memberships(user_id,email,fiscal_year_id,department_id,role,is_active)
 values(target.user_id,target.email,target.fiscal_year_id,manage_registered_user.department_id,
 case when promote then 'CFO_ADMIN'::finance_role else 'DEPARTMENT_MEMBER'::finance_role end,enabled)
 on conflict on constraint memberships_email_fiscal_year_id_department_id_key do update set role=excluded.role,is_active=excluded.is_active,user_id=excluded.user_id returning to_jsonb(memberships.*) into result;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data)
 values(actor,case when promote then 'GRANT_ADMIN' else 'UPDATE_REGISTERED_USER' end,'membership',target.id,target.fiscal_year_id,manage_registered_user.department_id,prior,result);
 return result;
end $$;
revoke all on function public.manage_registered_user(uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.manage_registered_user(uuid,uuid,uuid,boolean,boolean) to service_role;
create or replace function public.admin_command(actor uuid,command text,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare y uuid; active_y uuid; d uuid; new_id uuid; prior jsonb; result jsonb; rr finance_role; begin
 select id into active_y from fiscal_years where is_active;
 select department_id into d from memberships m join users u on lower(u.email)=lower(m.email) where u.id=actor and m.fiscal_year_id=active_y and m.is_active and m.role='CFO_ADMIN' limit 1;
 -- Closing is allowed from the active admin membership; closed years never grant mutation.
 if d is null then raise exception 'CFO admin access required.'; end if;
 rr:=assert_actor(actor,active_y,d,true);y:=coalesce(nullif(p->>'fiscal_year_id','')::uuid,active_y);
 if command='CREATE_YEAR' then
 insert into fiscal_years(label,code,start_date,end_date) values(p->>'label',p->>'code',(p->>'start_date')::date,(p->>'end_date')::date) returning id into new_id;
 insert into department_budgets(fiscal_year_id,department_id) select new_id,id from departments where is_active;
 if coalesce((p->>'copy_config')::boolean,false) then insert into faq_guides(fiscal_year_id,title,slug,content,display_order,is_published,updated_by) select new_id,title,slug,content,display_order,is_published,actor from faq_guides where fiscal_year_id=active_y; end if;
 result:=jsonb_build_object('id',new_id);
 elsif command='ACTIVATE_YEAR' then
 perform pg_advisory_xact_lock(73191);
 if not exists(select 1 from fiscal_years where id=y and not is_closed) then raise exception 'Choose an open fiscal year.'; end if;
 if not exists(select 1 from memberships where fiscal_year_id=y and is_active and role='CFO_ADMIN') then raise exception 'Assign a succeeding CFO before activating the year.'; end if;
 update fiscal_years set is_active=false where is_active;update fiscal_years set is_active=true where id=y;result:=p;
 elsif command='CLOSE_YEAR' then
 if y=active_y then raise exception 'Activate the succeeding year before closing this year.'; end if;
 if exists(select 1 from commitments where fiscal_year_id=y and status='ACTIVE' and remaining_amount>0) or exists(select 1 from requests where fiscal_year_id=y and status not in ('COMPLETED','REJECTED','CANCELLED')) or exists(select 1 from discrepancies where fiscal_year_id=y and status='OPEN' and severity='CRITICAL') then raise exception 'Resolve open requests, commitments, and critical discrepancies before closing.'; end if;
 update fiscal_years set is_closed=true,closed_at=now() where id=y;result:=p;
 elsif command='MEMBERSHIP' then
 perform pg_advisory_xact_lock(hashtextextended('membership-admin:'||y::text, 0));
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not public.email_domain_allowed(p->>'email') then raise exception 'Membership email must use the configured organization domain or gmail.com.'; end if;
 select jsonb_agg(to_jsonb(m)) into prior from memberships m where lower(email)=lower(p->>'email') and fiscal_year_id=y;
 if not exists(select 1 from departments where id=(p->>'department_id')::uuid and is_active) then raise exception 'Choose an active department.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p->>'email'), 1));
 if y=active_y and exists(select 1 from memberships m where lower(m.email)=lower(p->>'email') and m.fiscal_year_id=active_y and m.department_id=(p->>'department_id')::uuid and m.role='CFO_ADMIN' and m.is_active) and (p->>'role'<>'CFO_ADMIN' or not (p->>'is_active')::boolean) and (select count(*) from memberships where fiscal_year_id=active_y and role='CFO_ADMIN' and is_active)<=1 then raise exception 'Cannot remove the last active CFO.'; end if;
 if p->>'role'='DEPARTMENT_MEMBER' then update memberships set is_active=false where lower(email)=lower(p->>'email') and fiscal_year_id=y and department_id<>(p->>'department_id')::uuid and role in ('DEPARTMENT_MEMBER','PROJECT_MEMBER'); end if;
 insert into memberships(email,user_id,fiscal_year_id,department_id,role,is_active) values(lower(p->>'email'),(select id from users where lower(email)=lower(p->>'email')),y,(p->>'department_id')::uuid,(p->>'role')::finance_role,(p->>'is_active')::boolean) on conflict(email,fiscal_year_id,department_id) do update set role=excluded.role,is_active=excluded.is_active,user_id=excluded.user_id returning to_jsonb(memberships.*) into result;
 elsif command='PROJECT' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 new_id:=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
 insert into projects(id,fiscal_year_id,name,description,start_date,end_date,status,created_by) values(new_id,y,p->>'name',p->>'description',nullif(p->>'start_date','')::date,nullif(p->>'end_date','')::date,p->>'status',actor) on conflict(id) do update set name=excluded.name,description=excluded.description,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status where projects.fiscal_year_id=y;
 delete from project_departments where project_id=new_id;
 insert into project_departments(project_id,department_id) select new_id,value::uuid from jsonb_array_elements_text(p->'department_ids');result:=jsonb_build_object('id',new_id);
 elsif command='PROJECT_MEMBER' then
 if exists(select 1 from fiscal_years where id=y and is_closed) then raise exception 'Closed year is read-only.'; end if;
 if not exists(select 1 from projects pr join project_departments pd on pd.project_id=pr.id where pr.id=(p->>'project_id')::uuid and pr.fiscal_year_id=y and pd.department_id=(p->>'department_id')::uuid) then raise exception 'Project department mismatch.'; end if;
 insert into project_members(project_id,user_id,department_id) values((p->>'project_id')::uuid,(p->>'user_id')::uuid,(p->>'department_id')::uuid) on conflict(project_id,user_id) do update set department_id=excluded.department_id;result:=p;
 elsif command='DEPARTMENT' then
 insert into departments(code,name,is_active) values(p->>'code',p->>'name',(p->>'is_active')::boolean) on conflict(code) do update set name=excluded.name,is_active=excluded.is_active returning to_jsonb(departments.*) into result;
 elsif command='SETTING' then
 select to_jsonb(s.*) into prior from organization_settings s where key=p->>'key';
 insert into organization_settings(key,value) values(p->>'key',p->'value') on conflict(key) do update set value=excluded.value;result:=p;
 elsif command='REQUEST_TYPE' then
 update request_types set name=p->>'name',description=p->>'description',is_active=(p->>'is_active')::boolean,creates_commitment=(p->>'creates_commitment')::boolean,process_config=coalesce(p->'process_config','{}') where id=(p->>'id')::uuid;result:=p;
 elsif command='REQUIREMENT' then
 insert into document_requirements(request_type_id,document_code,label,is_required,condition_type,condition_json,display_order,template_url) values((p->>'request_type_id')::uuid,p->>'document_code',p->>'label',(p->>'is_required')::boolean,nullif(p->>'condition_type',''),p->'condition_json',coalesce((p->>'display_order')::integer,0),nullif(p->>'template_url','')) on conflict(request_type_id,document_code) do update set label=excluded.label,is_required=excluded.is_required,condition_type=excluded.condition_type,condition_json=excluded.condition_json,display_order=excluded.display_order,template_url=excluded.template_url;result:=p;
 else raise exception 'Unknown admin command.'; end if;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data) values(actor,command,'admin',null,active_y,d,prior,result);return result;
end $$;
commit;

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
