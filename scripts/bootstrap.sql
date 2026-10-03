-- Run AFTER the migration and seed. Replace all placeholders before execution.
-- The email can be enrolled before its first Google sign-in.
begin;
insert into public.fiscal_years(label,code,start_date,end_date,is_active)
values ('AY 2026-2027','2627','2026-06-01','2027-05-31',
  not exists(select 1 from public.fiscal_years where is_active))
on conflict(code) do nothing;
insert into public.department_budgets(fiscal_year_id,department_id)
select f.id,d.id from public.fiscal_years f cross join public.departments d
where f.is_active and d.is_active on conflict(fiscal_year_id,department_id) do nothing;
insert into public.memberships(email,fiscal_year_id,department_id,role)
select lower('javier.macasaet@student.ateneo.edu'),f.id,d.id,'CFO_ADMIN'
from public.fiscal_years f cross join public.departments d
where f.is_active and d.code='OCFO'
on conflict(email,fiscal_year_id,department_id)
do update set role='CFO_ADMIN',is_active=true;
commit;
