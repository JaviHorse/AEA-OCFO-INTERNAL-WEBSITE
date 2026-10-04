# Deploy AEA Finance to Vercel

Follow this guide in order. Replace `https://aea-finance.vercel.app` with your stable production domain. This app uses Supabase for data/sign-in, a service account for Drive/Sheets, a separate organization Gmail authorization for decision emails, and Resend for other alerts/reminders.

## 1. Prepare your accounts and release

You need a GitHub repository containing the app, lockfile, public assets, and migrations; a Vercel account allowed to import it; the existing Supabase project; Google Cloud access to the integrations; the request-register spreadsheet; and the organization mailbox. A verified Resend sender/domain is optional and can be added later. For a custom domain, also prepare DNS access. Choose a Vercel plan suitable for the organization and check its current usage limits.

Keep `.env.local`, `GDrive_key.json`, and tokens out of GitHub. Do not reset the existing database or rerun seed/bootstrap scripts over its records. Commit and push the reviewed release changes after running:

```powershell
npm ci
npm run check
npm run format:check
npm run test:ux
npm run test:hydration
npm run build
npm run check:security
npm run check:deployment
npm audit --omit=dev
```

On Windows, browser checks use installed Microsoft Edge; set `UX_BROWSER_PATH` if it is elsewhere. On Linux/CI run `npx playwright install --with-deps chromium` first. The hydration check exercises a real Next.js server/client boundary without cloud writes.

## 2. Import into Vercel

1. In Vercel, select **Add New → Project**, connect GitHub, and import the AEA Finance repository. Grant repository access in GitHub if it is missing.
2. Choose the project name and note its stable `*.vercel.app` production domain.
3. Select the **Next.js** framework preset. Set **Root Directory** to the directory containing `package.json` (the root for this repository).
4. Set **Install Command** to `npm ci` and **Build Command** to `npm run build`. Keep the framework's default **Output Directory**; do not use static export or a manual `out` directory.
5. Set **Node.js Version** to **22.x** in project settings. Local Node should be 22.13+ in the 22.x line; 24.x is also supported by this repository. Check the intended production branch.
6. Add all Production environment variables below before the final release. This app requires server execution; Vercel supplies the Next.js functions.

See [Vercel Git import](https://vercel.com/docs/git) and [supported Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Prepare Supabase

Migration **007 was verified accessible in the configured Supabase project on October 5, 2026**. Keep all migrations in source control. The checklist below also applies when configuring a different project.

Apply all missing migrations through **007**, including the performance indexes in 006 and confidentiality policies in 007. Preserve existing data. Confirm one open active fiscal year, an active CFO membership, and seeded departments/request types.

`npm run check:deployment` performs read-only checks against the configured project. A missing `department_request_totals` view means migration 007 is still needed. Run `node --env-file=.env.local scripts/apply-confidential-budgets.mjs` only if `DATABASE_URL` is configured; otherwise apply the migration in Supabase’s SQL editor.

## Configure the host

Use Node.js 22.13+ or 24. Build with `npm ci` and `npm run build`. A Node server runs with `npm start`; Vercel can use the included Next.js configuration. This app requires server execution and is not a static export.

Set these variables in the host’s environment settings, then redeploy when changing variables used in the browser:

In **Vercel → Project → Settings → Environment Variables**, select **Production**. Enter individual values without shell wrapping quotes and mark secrets sensitive where supported. `.env.local` is not uploaded automatically. The service-role key, Google keys/tokens, Resend key, and cron secret must remain server-only.

| Variable                                               | Purpose                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                  | Production HTTPS origin, without a trailing path                                                               |
| `NEXT_PUBLIC_SUPABASE_URL`                             | Supabase project URL                                                                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                 | Public Supabase publishable key                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                            | Server-only privileged database client                                                                         |
| `ALLOWED_EMAIL_DOMAIN`                                 | Default registration domain; normally `student.ateneo.edu`                                                     |
| `FINANCE_NOTIFICATION_EMAIL`                           | Required valid Finance recipient email; checked by app environment validation                                  |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`                         | Drive/Sheets service account                                                                                   |
| `GOOGLE_PRIVATE_KEY`                                   | Service-account private key; escaped newlines are supported                                                    |
| `GOOGLE_REQUESTS_SPREADSHEET_ID`                       | Sheets register spreadsheet                                                                                    |
| `GOOGLE_REQUESTS_SHEET_ID`                             | Numeric tab ID, usually `0`                                                                                    |
| `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET` | Separate organization Gmail OAuth client                                                                       |
| `GOOGLE_GMAIL_REDIRECT_URI`                            | Exact callback used for local sender authorization, normally `http://localhost:3000/api/google/gmail/callback` |
| `GOOGLE_GMAIL_REFRESH_TOKEN`, `GOOGLE_GMAIL_SENDER`    | Connected organization sender                                                                                  |
| `RESEND_API_KEY`                                       | Optional; needed only when enabling Resend finance alerts/reminders.                                           |
| `RESEND_FROM_EMAIL`                                    | Optional; a verified sender explicitly enables Resend when an API key is also present.                         |
| `CRON_SECRET`                                          | Long random secret for the scheduled maintenance endpoint                                                      |

`GOOGLE_IMPERSONATED_USER` is optional and requires Workspace domain-wide delegation. `DATABASE_URL` and bootstrap settings are needed only when running SQL setup tools, not for the web app. Production never reads the local `GDrive_key.json` file.

Get Supabase URL/keys from that project's API settings. Use the service-account JSON's `client_email` and complete `private_key` for the two Google service-account variables, not the whole JSON document. Keep BEGIN/END lines; real line breaks or literal `\n` escapes are supported. The spreadsheet ID is between `/d/` and `/edit` in its URL; the numeric sheet ID is the tab's `gid`, often `0`.

Use your full production HTTPS origin for `NEXT_PUBLIC_APP_URL`, without a path or trailing slash. Leave `RESEND_FROM_EMAIL` unset until you have a verified domain. To enable Resend later, set it to a verified sender such as `AEA Finance <finance@your-verified-domain.org>` and set `RESEND_API_KEY`, then redeploy. Administration can override the sender only after these environment variables enable Resend. Generate a strong cron secret locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not set `NODE_ENV` manually. Use separate databases, spreadsheets, and test integrations for Preview deployments; do not give arbitrary preview branches production finance credentials. Each working preview needs matching application and allowed callback URLs. Environment changes affect new deployments, and public variables are embedded at build time: **redeploy after changing them**. See [Vercel environment configuration](https://vercel.com/docs/environment-variables) and [sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## Configure callbacks and sharing

1. Open **Supabase → Authentication → URL Configuration**. Set **Site URL** to the production origin and add the exact `https://your-domain/auth/callback` to **Redirect URLs**. Retain the local callback if development is needed. Prefer exact production URLs over broad wildcards.
2. In **Authentication → Sign In / Providers → Google**, confirm Google is enabled with the login OAuth client. Copy the Supabase callback shown there, normally `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. In Google Cloud's login OAuth Web application client, add that **Supabase callback** to **Authorized redirect URIs**. It is different from this app's `/auth/callback`. If JavaScript origins are configured, include the production origin. Confirm the consent/audience settings allow intended users.
4. Enable Drive and Sheets APIs in the service account's project. Share the register with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as **Editor**. Confirm the numeric tab exists and preserve expected register headers. Share supporting folders with the integration account as **Viewer**. A member's own access does not imply service-account access.
5. When enabling optional Resend emails, verify its sender domain/DNS records, then configure the sender/finance recipients. Skip this step while Resend is disabled.

See [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Authorize the organization Gmail sender locally

The app allows Gmail authorization only in development with a signed-in CFO. Production returns 403 for the authorization endpoint because it cannot persist tokens into Vercel's filesystem. **Authorize locally, then copy the refresh token into Vercel.**

1. Enable Gmail API for the separate Gmail OAuth client. Configure its consent screen/audience and allow the organization mailbox.
2. Add `http://localhost:3000/api/google/gmail/callback` to that client's **Authorized redirect URIs**.
3. Set `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REDIRECT_URI`, and `GOOGLE_GMAIL_SENDER` in `.env.local`. The redirect must exactly match the registered local callback.
4. Run `npm run dev`, sign in as CFO, and open `http://localhost:3000/api/google/gmail/authorize`.
5. Authorize with the exact mailbox in `GOOGLE_GMAIL_SENDER`. The callback saves the refresh token in the ignored `.env.local`; restart local development if needed.
6. Run `npm run check:gmail`. It checks token identity and `gmail.send` scope without sending an email.
7. Copy all Gmail variables, including the refresh token and callback URI used during authorization, into Vercel Production. Unattended sending uses that token; no production callback visit is required.

If already authorized, retain the working client/token pair and verify it. External OAuth apps left in **Testing** normally issue seven-day refresh tokens for Gmail scopes. Configure an appropriate production audience/status and complete Google's verification requirements for your usage; tokens can also be revoked by mailbox/account changes. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

Run `npm run check:integrations` and `npm run check:email` locally to inspect Sheets/Resend configuration. Read their output: these diagnostics do not convert every provider failure into a failing exit code. Restricted Resend sending keys may not list domains; confirm sender verification in Resend's dashboard. These commands use local variables, not Vercel settings, and do not prove real email delivery.

## Launch without Resend

`RESEND_FROM_EMAIL` and `RESEND_API_KEY` are optional for deployment. If either is missing or blank, Resend delivery is disabled before recipient/database/provider work, without FAILED notification records or deployment failure. Gmail remains required and continues requester approval, rejection, and revision emails. Finance actions, database audit history, on-screen request status, discrepancies, Drive checks, and Sheets synchronization still work.

The following emails are not sent while Resend is disabled:

| Events                                                      | Recipients and notification                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NEW_SUBMISSION`                                            | Configured Finance recipients, active CFOs, and extra notification recipients: new request alert. |
| `SUBMISSION_CONFIRMATION`                                   | Requester: submission confirmation.                                                               |
| `READY_FOR_CFO`                                             | Finance recipients: request ready for CFO approval.                                               |
| `UNDER_OCFO_REVIEW`, `PROCESSING`, `COMPLETED`, `CANCELLED` | Requester: corresponding status update.                                                           |
| `MISSING_REQUIRED_DOCUMENT`                                 | Requester: required document marked unverified.                                                   |
| `CRITICAL_DISCREPANCY`                                      | Finance recipients: critical discrepancy alert.                                                   |
| `PROJECT_END_DUE_SOON`                                      | Representative request's requester: project-end report due soon.                                  |
| `PROJECT_END_OVERDUE`                                       | Representative request's requester and Finance recipients: overdue project-end report.            |

Skipped emails are not queued for backfill. After configuring verified sender/key values and redeploying, new events and eligible future reminders use Resend again. Verify any Administration sender override also belongs to a verified domain. For launch testing, require Gmail decision delivery; defer Resend alert delivery checks until it is enabled.

## Deploy and set the final domain

Deploy the configured project and wait for a successful build. Open the stable production URL and inspect Vercel build/runtime logs if it fails. To add a custom domain, use **Settings → Domains**, create the DNS records Vercel displays, and wait for HTTPS verification.

If the final domain changes, update `NEXT_PUBLIC_APP_URL`, Supabase Site URL/allowed callback, and applicable Google login origins, then redeploy and test sign-in again. Check deployment protection allows intended production users to reach the portal. Share the stable production domain with members, not an ephemeral preview URL.

## Scheduled maintenance

`vercel.json` schedules `/api/cron/reconcile` daily at **01:00 UTC / 09:00 Asia/Manila**. The endpoint requires `Authorization: Bearer <CRON_SECRET>`. On another host, configure an equivalent scheduler with that header.

Vercel sends that header automatically when the Production `CRON_SECRET` variable is set. Cron runs only on production deployments. Check the project's Cron Jobs area and execution logs after deployment. Hobby cron has daily frequency and approximate hourly timing; exact 09:00 execution is not guaranteed. See [cron setup](https://vercel.com/docs/cron-jobs/quickstart), [authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and [plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Manually invoking this endpoint performs real maintenance: it can create issue/notification records, send alerts, update check timestamps, and update Sheets. It is not a read-only readiness check.

The route checks open fiscal years, identifies finance discrepancies, rotates through two source-folder checks per year, and retries queued Sheets updates. Source checks only need one file to establish that a folder is nonempty. Submitted-folder validation checks all supporting files and rejects folders exceeding 2,000 files rather than retaining an unbounded list.

Monitor execution duration, failed notifications, queued register jobs, and provider quotas. Bounded batches limit memory, but very large histories or slow providers can still exceed the route’s 60-second host deadline. Move maintenance to a longer-running scheduled worker when measured workload requires it. Financial/audit records are not purged automatically; decide backup and retention rules with the organization.

## Release checks

Run `npm run check`, `npm run format:check`, `npm run test:ux`, `npm run build`, and `npm run check:security`. Run `npm run check:deployment -- --production` using production configuration to verify the required settings and database objects.

Also run `npm run test:hydration`. To check the exact Vercel configuration without replacing your localhost settings, put the same Production values in a temporary ignored `.env.production.local`, then run:

```powershell
node --env-file=.env.production.local scripts/check-deployment.mjs --production
```

Do not commit or share this file. The normal npm deployment check uses `.env.local`; its localhost URL should fail the production-origin check. Passing this read-only check verifies required settings/database objects and URL consistency, but does not verify every provider permission.

After deploying, verify Google sign-in, member registration/dashboard, a request submission, OCFO review, a CFO decision, a budget adjustment, transaction recording, CSV download, Sheets recording, and notification delivery. Use designated test records and inspect their audit trail. No local fixture test can substitute for checking production OAuth callbacks or provider sharing.

Confirm that the member dashboard hides confidential budgets, CFO Academic Years fields hydrate without console errors, closed years suppress writes, request queue roles remain correct, CSV totals match, Sheets rows are not duplicated, and delivery history reflects actual received emails. Check mobile navigation and refreshing protected routes. Verify cron duration and pending retries in logs before calling the launch complete.

## Troubleshooting and rollback

| Symptom                         | First checks                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Build error                     | Failing log, Node version, root directory, committed lockfile, environment names, and local checks.                                  |
| Sign-in returns to localhost    | Production app URL and Supabase URL configuration; then rebuild/redeploy.                                                            |
| Google redirect mismatch        | Login uses Supabase's callback; local Gmail uses `/api/google/gmail/callback`. Match the correct client and exact URI.               |
| Member dashboard/database error | Deployment points to the migrated project; memberships/year records and migration 007 are correct.                                   |
| Drive or Sheets failure         | Integration-account permissions, enabled APIs, spreadsheet/tab IDs, register headers, and credentials.                               |
| Gmail stops after a week        | OAuth Testing status, revoked token, exact sender identity, scope, and original client/token pair. Reauthorize locally if necessary. |
| Resend rejects sender           | Verified domain, key permissions, and Administration's sender override.                                                              |
| Cron missing/unauthorized       | Production cron secret, committed schedule, redeployment, and deployment protection.                                                 |
| Timeout                         | Slow providers, execution deadline, and growing workload; do not increase query sizes merely to reduce calls.                        |

Monitor Vercel runtime errors, Supabase backups/health, provider quotas, notification failures, and register retries. Review [function execution limits](https://vercel.com/docs/functions/limitations). Bounded memory does not make data storage or runtime constant.

To recover a broken release, restore a known-good Vercel deployment or redeploy that commit with corrected settings. Confirm compatibility with the current database. Application rollback does not undo migrations, decisions, transactions, or emails; preserve the database and review data corrections separately.
