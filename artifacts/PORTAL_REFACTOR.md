# AEA Finance portal refactor

The portal has two visible experiences: Finance Administrator and Member. Existing database enums remain unchanged. CFO accounts retain final decision and administration permissions; legacy Finance reviewers use the Admin shell without receiving additional privileges. Legacy project-only accounts must receive a department membership before filing.

## Activation

For the existing database, apply `supabase/migrations/003_allow_personal_gmail.sql` if it has not already been applied, then apply all of `supabase/migrations/004_portal_registration.sql` in a new Supabase SQL Editor query. Both migrations are safe to reapply. Do not rerun migration 001 or the complete fresh-install bundle on an initialized database. Restart the local development server after updating the code.

The database migration has been verified locally; it has not been applied to the live Supabase project. This environment has API credentials but no PostgreSQL schema-management connection configured.

## Registration and access

- New Ateneo Google accounts go to `/register`, choose one active department, and receive a fixed `DEPARTMENT_MEMBER` membership for the open active fiscal year.
- Email and identity come from the authenticated Google session/JWT. Registration accepts no email or role argument.
- Gmail accounts can sign in when manually enrolled by an Admin; Gmail self-registration remains disabled to reconcile the latest specification with the previous Gmail access request.
- Existing Admins go directly to the Admin dashboard. Existing, inactive, or historical memberships cannot be replaced through registration; Finance assigns access for the current year.
- Members cannot switch departments or reactivate themselves. Audited Admin reassignment deactivates old department access without deleting membership history.
- Admin designation requires confirmation and an existing CFO permission check, and is audit logged. The last-CFO safeguard is preserved and membership administration is serialized per fiscal year.

## Reused finance boundaries

The original finance engine is preserved as an internal database function. Its direct execution is revoked from application roles. The public server-only command rejects Admin filing before calling that engine and verifies the member's primary department. Existing exact-money calculations, approval overrides, commitments, transactions, discrepancies, closed-year guards, Drive archival, Resend notifications, and audit records remain in place.

RLS stays enabled. Normal member reads are narrowed to one primary department per fiscal year, including legacy multiple memberships. The helper resolving that department is not directly callable by authenticated browser clients. Internal Finance comments retain their existing private RLS policy. New onboarding reads use a server-only, authenticated path that returns only active department choices.

## Screens and routes

- Login with a registration entry point and OAuth onboarding; no password authentication.
- Member sidebar: Dashboard, Requests, Projects, Help & Requirements, with profile and sign-out at the bottom.
- Member dashboard: available budget, pending requests, own drafts, revisions, Finance feedback, and recent requests.
- Admin sidebar: requests, approvals, budgets, transactions, reports, departments, projects, help, and authorized administration.
- Admin dashboards contain no applicant filing links. Request category tabs and workflow filters are immediately visible.
- `/approvals` provides readiness cards, requester, verified document count, open issues, and exact budget impact. The approval link opens the existing request detail in a focused decision layout.
- `/budgets` and `/budgets/[department]` present department balances; department detail uses tabs instead of stacking all records.
- `/profile` shows the registered identity, department, account type, and fiscal year without a department editor.
- Administration → Registered Users supports department corrections, deactivation, confirmed Admin assignment, and fiscal-year access assignment.
- Four-step request wizard, dynamic documents, exact PDAF threshold, folder validation, revision history, and status timeline are reused. The department field is locked.

## Verification

Production build and TypeScript validation pass. Automated tests exercise real PostgreSQL-compatible migrations and RPCs, including reapplying migrations, Admin submission/draft rejection, denied direct engine calls, member approval rejection, fixed-role registration, duplicate registration, Gmail registration rejection, invalid department rejection, reassignment, deactivation, audit logging, closed-year protection, private comments, money and commitment behavior. Real server-action guard tests verify rejected calls cause no integration writes.

Browser fixtures exercise real pages/components without live cloud writes: Member navigation, request wizard, exact document thresholds, inaccessible/empty folders, submission payload, Finance verification/comments, revision feedback, approval confirmations and overrides, empty queues, Admin filing-link suppression, direct route guards, registration, and mobile overflow. Screenshots are under `artifacts/ux-review/`.

Live Google OAuth, registration against the deployed migration, Drive copying, and email delivery still require end-to-end verification with the real accounts and configured services.
