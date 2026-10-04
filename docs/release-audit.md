# Release audit — October 5, 2026

## Completed changes

- Reports aggregate narrow, paginated database results instead of keeping full request histories in memory. CSV downloads stream authenticated batches rather than sending every record to a browser component.
- Reconciliation reads bounded request and transaction batches, including records beyond Supabase response caps. Related records and project relationships are scoped to the relevant requests, projects, and year.
- Project and department histories paginate. Request tables render on the server; obsolete client filters and unused components were removed.
- Database fetches bypass shared caches and have a 20-second deadline. Email delivery uses batches of five. Folder validation rejects more than 2,000 files; background folder checks request only a preview.
- Local fonts were converted to WOFF2 with matching glyphs and layout metrics: 246,860 bytes became 96,312 bytes, a 61% reduction. Static brand/font requests bypass authentication middleware.
- Removed requirements documents, duplicate source images, unused browser/export/verification components, and the obsolete bundled SQL installer. Kept active migrations, assets, font licenses, and financial records. Diagnostic tools now live in `scripts/diagnostics/`.
- Replaced the README, documented deployment, and added lint, formatting, deployment checks, and GitHub CI.

## Verification

Lint, TypeScript, and all **31 automated tests** passed. Tests cover financial arithmetic, database migrations and role isolation, server authorization, OAuth handling, integration retries, optional Resend delivery and production validation, and large histories. Reconciliation was exercised with 1,250 requests and 1,203 related transactions; CSV export with 1,203 records and a simulated response cap below the requested batch size.

Desktop and mobile fixture checks passed across the workspace and account screens, including expanded sections, fonts, navigation, budget controls, and closed-year behavior. Fixtures do not verify production sign-in credentials or provider permissions.

The production build completed successfully, including TypeScript and route generation. Formatting checks passed. After the hydration fix, the built browser assets were scanned: 22 assets contained none of the configured server credentials. This scan checks configured secrets, not every possible security issue.

`npm audit --omit=dev` reported **zero runtime dependency vulnerabilities**. The full audit reports five high-severity package entries in one development-only ESLint dependency chain. The underlying [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no published patched version at audit time. A forced audit fix would downgrade the Next.js lint configuration; it was not applied. Recheck this advisory before future dependency upgrades.

## Remaining deployment requirements

After the owner applied migration 007, a new read-only check verified that `department_request_totals` is accessible, exactly one open fiscal year exists, and an active CFO membership exists for it. The previous migration blocker is resolved. See the expanded [Vercel deployment instructions](deployment.md).

The shared form field no longer clones server-rendered controls in a client component to inject generated IDs. Native wrapping labels preserve association across the RSC boundary. A real Next.js hydration regression check verifies server and client controls, accessible labels, and form interaction without browser console errors. Browser scripts also support Linux CI rather than assuming a Windows Edge path.

Resend is optional for launch. Missing/blank environment sender or API key skips its alerts/reminders before notification inserts or provider work, while Gmail decisions remain routed independently. A database sender override alone cannot enable Resend. Both production validation and a full optimized build passed regression checks with Resend values absent/blank. Re-enabling Resend preserves delivery history for real provider failures; skipped events are not queued for backfill. See the deployment guide for the complete disabled-email list.

Configure production environment variables, OAuth callbacks, provider sharing, and the cron secret. Run `npm run check:deployment -- --production` against that configuration, then perform the production smoke checks listed in the deployment guide. This audit did not deploy the site, change hosted financial records, or send real notifications.

The available local configuration is still a development configuration: its production-mode check fails because the app URL is localhost and `CRON_SECRET`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` are absent. Local Google integration can use the ignored JSON key file; production must use environment variables. These findings do not inspect an already configured Vercel project. A read-only Gmail check passed token identity and sending scope; its recent delivery history includes one SENT and one FAILED record, so production smoke testing must confirm actual current delivery.

Read-only integration checks also confirmed the Sheets register and configured tab are accessible and the Resend key connects. A local `next start` smoke check served login/brand/font assets, redirected unauthenticated protected pages to login, and hydrated the production login page without browser errors. These checks did not sign into a deployed production account or send test messages.

Batches bound memory use; they do not make execution time or database storage constant. Monitor cron duration and provider quotas as histories grow, and establish backup and retention rules. A very large maintenance job may require a worker with a longer execution deadline than the current 60-second route. No financial or audit records were deleted to reduce storage.
