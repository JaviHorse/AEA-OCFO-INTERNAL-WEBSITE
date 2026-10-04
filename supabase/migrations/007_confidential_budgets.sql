begin;
-- Protect the underlying records as well as the security-invoker financial view.
drop policy if exists scoped_read on public.department_budgets;
create policy scoped_read on public.department_budgets for select to authenticated
using (public.is_finance(fiscal_year_id));
drop policy if exists scoped_read on public.budget_adjustments;
create policy scoped_read on public.budget_adjustments for select to authenticated
using (public.is_finance(fiscal_year_id));

create or replace view public.department_request_totals with (security_invoker=true) as
select fiscal_year_id, department_id, sum(amount) total_requested
from public.requests
where status not in ('DRAFT','CANCELLED')
group by fiscal_year_id, department_id;
grant select on public.department_request_totals to authenticated;

-- Change the allocation through a documented adjustment; never overwrite history.
create or replace function public.set_department_budget(actor uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare y uuid := (p->>'fiscal_year_id')::uuid;
 d uuid := (p->>'department_id')::uuid;
 target numeric(14,2) := (p->>'amount')::numeric(14,2);
 prior department_financials%rowtype;
 result jsonb;
begin
 perform assert_actor(actor,y,d,true);
 perform pg_advisory_xact_lock(hashtextextended(y::text||d::text,0));
 if target is null or target < 0 or length(trim(coalesce(p->>'reason',''))) < 3 then
   raise exception 'Enter a nonnegative budget and an explanation.';
 end if;
 select * into prior from department_financials where fiscal_year_id=y and department_id=d;
 if not found then raise exception 'Department budget record not found.'; end if;
 if (p->>'expected_budget') is null or prior.current_budget <> (p->>'expected_budget')::numeric then
   raise exception 'The budget changed. Refresh this page before saving.';
 end if;
 if target < prior.actual_expenses + prior.active_commitments then
   raise exception 'Budget cannot be below recorded spending and active commitments.';
 end if;
 if target = prior.current_budget then raise exception 'The budget is already set to this amount.'; end if;
 insert into budget_adjustments(id,fiscal_year_id,department_id,amount_delta,type,reason,approved_by)
 values((p->>'idempotency_key')::uuid,y,d,target-prior.current_budget,'ADMIN_ALLOCATION',trim(p->>'reason'),actor)
 returning to_jsonb(budget_adjustments.*) into result;
 insert into audit_logs(actor_user_id,action,entity_type,entity_id,fiscal_year_id,department_id,old_data,new_data)
 values(actor,'SET_DEPARTMENT_BUDGET','budget_adjustments',(result->>'id')::uuid,y,d,to_jsonb(prior),result);
 return result;
end $$;
revoke all on function public.set_department_budget(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.set_department_budget(uuid,jsonb) to service_role;
commit;
