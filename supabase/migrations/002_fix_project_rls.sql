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
