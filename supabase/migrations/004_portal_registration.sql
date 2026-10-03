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
