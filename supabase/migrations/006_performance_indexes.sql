-- Query-matched indexes only. No policy, grant or finance-function changes.
-- For large production tables deploy equivalent CREATE INDEX CONCURRENTLY
-- statements outside a migration transaction during an appropriate window.
create index if not exists requests_year_created on public.requests (fiscal_year_id, created_at desc, id desc);
create index if not exists requests_department_created on public.requests (fiscal_year_id, department_id, created_at desc, id desc);
create index if not exists requests_year_status_created on public.requests (fiscal_year_id, status, created_at desc, id desc);
-- session() uses equality on normalized email, unlike lower(email) RLS lookups.
create index if not exists memberships_active_email_year on public.memberships (email, fiscal_year_id, id) where is_active;
create index if not exists discrepancies_entity_open_critical on public.discrepancies (entity_id) where status = 'OPEN' and severity = 'CRITICAL';
