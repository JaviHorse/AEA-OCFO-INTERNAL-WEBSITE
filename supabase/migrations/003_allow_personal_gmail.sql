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
