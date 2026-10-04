# AEA Finance

A finance portal for the Ateneo Economics Association. Members file and track requests; OCFO reviews supporting documents; the CFO manages approvals and departmental allocations. The interface follows AEA’s visual identity, with responsive layouts and accessible expandable sections.

## Features

- Department and project requests with supporting Google Drive folder links.
- Document verification, private OCFO reviews, and messages visible to applicants.
- Audited approval, revision, rejection, cancellation, and transaction workflows.
- Confidential department budgets and a member dashboard showing requested amounts.
- Fiscal-year turnover with read-only historical years.
- Request summaries and a streamed CSV compilation.
- A retryable Google Sheets register, Gmail decision messages, and finance alerts.

## Stack

Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL/Auth, Google Drive/Sheets/Gmail APIs, and Resend. Financial commands run atomically in PostgreSQL. Row-level security controls database reads, and privileged mutations verify the acting user on the server and in the database.

## Local setup

Use Node.js 22.13+ or Node.js 24 and npm.

```bash
npm ci
```

Copy `.env.example` to `.env.local` and fill in your project’s values. Initialize Supabase using the instructions below, configure Google sign-in, then start the app:

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). Credentials, local diagnostics, generated screenshots, and build output are ignored by Git.

## Database setup

For a **new database**, apply these files in Supabase’s SQL editor, in order:

1. `supabase/migrations/001_finance.sql`
2. `supabase/seed.sql`
3. `supabase/migrations/002_fix_project_rls.sql`
4. `supabase/migrations/003_allow_personal_gmail.sql`
5. `supabase/migrations/004_portal_registration.sql`
6. `supabase/migrations/005_google_sheets_register.sql`
7. `supabase/migrations/006_performance_indexes.sql`
8. `supabase/migrations/007_confidential_budgets.sql`
9. `scripts/bootstrap.sql`, after replacing the example dates and CFO email.

For an **existing database**, apply only missing migrations. Never rerun the original schema or reset an existing database to upgrade it.

Alternatively, configure `DATABASE_URL` and the `INITIAL_CFO_EMAIL` / `INITIAL_FISCAL_YEAR_*` settings described in `.env.example`, then run `npm run db:setup`. Supabase API keys cannot apply SQL migrations.

Migration 007 is required for database-level budget confidentiality and CFO budget updates. The member dashboard can still calculate request totals before it is installed, but that compatibility fallback does not replace the database permissions migration.

## Roles and financial records

Members register with an eligible Ateneo Google account and one department. Administrators can enroll eligible Gmail accounts, reassign or deactivate memberships, and grant CFO access through audited controls.

- **Member:** Dashboard, Requests, Projects, and Help & Requirements.
- **OCFO:** Finance review and document verification, subject to existing role restrictions.
- **CFO:** Final decisions, finance administration, fiscal years, and configuration.

Under **Administration → Finance**, the CFO can update a department allocation with a reason and record actual expenses or revenue against eligible approved requests. Budget adjustments retain history and reject stale edits. Spent, Revenue, Committed, and Available are calculated from their underlying records. Closed fiscal years remain read-only.

## Integrations

Configure Supabase Google OAuth with `/auth/callback` on your local and production app URLs. The Google sign-in client redirects to Supabase’s callback URL; organization Gmail authorization uses the separate `/api/google/gmail/callback` route.

The Sheets service account needs Editor access to the configured spreadsheet. The register tab must have exactly these headers: **Reference, Request, Amount, Status, Updated, Action**. Applicants’ original Drive folders are linked for manual verification. Failed register writes stay queued and can be retried from request details or the scheduled job.

Use **Administration → Settings** to connect the organization Gmail sender. Configure a verified Resend sender for finance alerts and reminders. See [deployment instructions](docs/deployment.md) for production environment variables, callbacks, and scheduled maintenance.

## Validation

```bash
npm run check          # lint, TypeScript, and unit/database tests
npm run format:check
npm run test:ux        # browser fixtures; install Chromium first
npm run build
npm run check:security # scan the production browser assets
npm run check:deployment
```

For browser checks, run `npx playwright install chromium` once. Tests use isolated fixtures and an in-memory PostgreSQL-compatible database; they do not send email or modify cloud finance records. GitHub Actions runs the same validation on pushes and pull requests.

## Repository layout

```text
src/app/              Routes, server actions, layouts, and theme styles
src/components/       Shared interface components
src/lib/              Authorization, finance rules, queries, and integrations
supabase/migrations/  Ordered database migrations
supabase/seed.sql      Reference configuration
public/brand/         AEA logo and mascots
public/fonts/         Locally hosted fonts and their licenses
scripts/              Setup and operational checks
scripts/diagnostics/  Optional development diagnostics and measurements
tests/                Finance, access, query, integration, and browser fixtures
docs/                 Deployment instructions and audit findings
```

Production request lists are paginated, report downloads stream in batches, and reconciliation processes related records in bounded batches. Authenticated data is not stored in a shared fetch cache. Historical financial and audit records are retained; maintenance does not automatically delete them. See the [release audit](docs/release-audit.md) for validation results and remaining deployment requirements.
