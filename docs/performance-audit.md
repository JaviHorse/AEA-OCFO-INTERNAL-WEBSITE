# Performance audit - baseline inspection

No authenticated browser timings have been collected yet. Counts below are source-derived PostgREST calls, excluding Auth, proxy refresh and layout. Shared layout adds two reference reads (deduplicated when the same year is requested); session adds three database reads plus getUser. Historical year adds two reads.

| Page                   |                                                                 Baseline reads | Diagnosis                                                                                          | Priority |
| ---------------------- | -----------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------- | -------- |
| Dashboard              |                                     4 member / 5 finance, +1 revision comments | Entire request year for counts and five recent rows; finance issues unused                         | P0       |
| Requests               |                                                        4 +1 finance requesters | Entire request year serialized; client filtering/pagination; all projects                          | P0       |
| Approvals              |                                                                              3 | Entire year before decision filtering in browser                                                   | P0       |
| Request detail         | 8 +1 request +7 finance supporting tables +1 people +1 register =18; member 13 | Multiple sequential waves; all supporting tables even on edit; year-wide project associations      | P1       |
| Reports                |                                                                              3 | Entire year rendered and serialized again as CSV; default Supabase row cap risks incomplete totals | P1       |
| Departments            |                                                                              2 | Already focused financial view, no external calls                                                  | P2       |
| Department detail      |                                                 8 datasets + 1 adjustments = 9 | Unbounded department requests/transactions                                                         | P1       |
| Admin                  |                                                                   tab-specific | Audit capped 200, notifications 100 without older-page navigation; members/users unbounded         | P1       |
| Transactions / budgets |                                                                       redirect | Legacy routes redirect to requests or departments                                                  | P2       |
| Projects               |                                                                              3 | Reference-like project list and associations; no external API                                      | P2       |
| Project detail         |                       1 project + 6 datasets + 2 support + up to 1 people = 10 | Scoped requests/transactions, but reloads all year projects/associations                           | P1       |
| New request            |                                                                              5 | Required form references; creates Drive client for configured email, no Drive network call         | P2       |
| Guide                  |                                                     2 references + 1 guide = 3 | Focused references and published guide                                                             | P2       |
| Profile                |                                                     1 departments + 1 user = 2 | Small scoped page                                                                                  | P2       |

## Actions and integration chains

Submit: authorization -> Drive metadata -> complete folder listing -> atomic finance RPC -> root layout revalidation -> register lease/jobs/context -> Sheets -> two email notifications. Decision: authorization/request read -> atomic RPC -> root layout invalidation -> parallel Sheets/email -> critical issue count/alert. Transaction: RPC -> request lookup -> issue count -> email. Integration work blocks successful finance responses. Register already has a durable SQL trigger queue and cron retry; email delivery is recorded in notifications. Use Next after (documented locally) for post-commit integrations; this is bounded platform-supported execution, not durable email retries.

Full-year reconciliation is only invoked by the authenticated cron route. RPC does targeted finance checks; retain all atomic checks and RLS. Reference reads/session already use React request cache. Dataset calls already use Promise.all. No network N+1 on request lists (people batched); client repeated find operations add CPU. Gmail performs token refresh + identity/scope validation every send; retain security checks. Drive rebuilds JWT twice per validation; no explicit timeout. googleapis is server-only/externalized; pages are server components. Interactive client components are appropriate; reports CSV duplicates full data. Forms already use transitions; redundant router.refresh after action revalidation exists. No normal internal full browser reload found.

## Index diagnosis

Existing requests_scope(year,department,status), transactions_scope(year,department,date), partial membership lower(email)/year and unique issue index do not cover year+created_at request ordering, finance year+status ordering, or email equality membership lookup. Candidate new indexes must match those paths. Actual production pg_indexes/EXPLAIN requires a read-only database connection; do not claim migration files describe deployed indexes.

## Planned scope

P0: bounded SQL request/decision lists with full server filters; dashboard exact SQL counters and five recent rows; stop fetching unused issues; post-commit integrations via after; targeted invalidation.
P1: dev-only sanitized query/RPC/integration timing; focused indexes migration; Drive timeouts/client reuse; parallel historical context reads. Preserve report completeness and document remaining large lists rather than truncate finance data.
P2: production versus development HTTP smoke timings, regression/security tests, bundle secret scan; identify measurements requiring authenticated deployment.

## Implemented results

- `src/lib/page-data.ts`: dashboard-specific exact HEAD counts, five recent rows, at most five revision attention items; financial view arithmetic unchanged. Finance dashboard uses 7 reads (3 references + recent +3 counts), member 6 (+1 comment read if needed). This deliberately replaces row payload with exact bounded/count queries; it does not pretend fewer queries always means less work. References and counters now execute in the same parallel wave after auth.
- Requests: 3 reference datasets + one 25-row SQL page; optional requester filter adds one batched ID lookup. Removed otherwise unused requester payload. Decisions: same four datasets with decision SQL filter, including legacy PROCESSING/COMPLETED as Approved. Both have stable created_at/id ordering, search, department, type, project, requester, date and status filters, URL pagination and pending feedback. Filters require Apply filters instead of filtering all loaded records locally.
- Admin members, notifications and audit: 50 rows, exact total, stable ordering, next/previous. Audit filters and member email search execute in SQL; users loaded only for visible member IDs. Project administration still loads its user selector.
- Request detail edit: returns the form before loading comments/history/checks/approvals/notifications/users. Full view retains supporting finance records; no speculative lazy tabs rewrite on a tiny dataset.
- `src/app/actions.ts` / `src/lib/post-commit.ts`: submission, transitions, missing-document flags, critical issue alerts and transaction alerts no longer await post-commit email/Sheets. `after()` awaits all tasks and reports sanitized failures; existing notifications record SENT/FAILED. Existing register trigger/lease/cron provides durable Sheets retries. Critical finance transaction, status history, authorization and RLS remain unchanged. Email has no durable outbox: function timeout/crash can still lose delivery; this is a remaining reliability limitation, not a promise of guaranteed delivery.
- RPC invalidation: comments/reviews/doc checks target request detail (+dashboard for comments); finance changes invalidate financial/request surfaces instead of root layout. Request detail patterns also invalidate budget previews on related tickets. Account/year/department changes retain root layout invalidation because access and shared navigation actually change. Explicit register retry only invalidates that request.
- Historical year + membership reads run in parallel after session; post-transaction alert lookups run in parallel after commit.
- Drive: one JWT/client per validation, 15-second transport/API timeout and no automatic UI retries; folder pagination and shortcut verification retained. This is a per-call timeout, not a total folder deadline.
- Instrumentation: set PERF_TIMING=1 locally. Query/RPC labels include only table/function names; workspace/dashboard/request-loader totals, every main server action total, Drive operations, Gmail token/identity/send, reconciliation total and integration callback totals. Fetch timing covers the HTTP response boundary; higher-level totals include parsing/processing. Disabled in production. No cross-user caches were added.

## Index migration

`supabase/migrations/006_performance_indexes.sql` adds:

1. requests(fiscal_year_id, created_at DESC, id DESC): year list/recent ordering.
2. requests(fiscal_year_id, department_id, created_at DESC, id DESC): department list ordering.
3. requests(fiscal_year_id, status, created_at DESC, id DESC): year queue/count predicates.
4. memberships(email, fiscal_year_id, id) WHERE is_active: actual normalized-email equality in session; existing lower(email) index is retained for RLS.
5. discrepancies(entity_id) WHERE status='OPEN' AND severity='CRITICAL': post-commit targeted alerts.

Migration is validated and idempotent in PGlite, and included in db setup. **Not applied to the live database.** No DATABASE_URL is configured; production catalog and EXPLAIN ANALYZE could not be inspected. For large deployed tables use equivalent concurrent index creation outside a migration transaction. Department financials is already a security-invoker view aggregating transactions/commitments/budget adjustments; balance calculations are preserved. Its existing transaction scope index helps; evaluate active commitment year/department indexing with real plans before adding more indexes.

## Measurements actually collected

Artifacts: `artifacts/performance/database-probes.json`, `production-routes.json`, `development-routes.json`. Reproduce with `node --env-file=.env.local scripts/diagnostics/measure-performance.mjs` and `node scripts/diagnostics/measure-routes.mjs <mode> <port>`.

Read-only service-role probes, three trials, active year has **3 requests**:

| Query                                             | Median ms | Serialized data bytes |
| ------------------------------------------------- | --------: | --------------------: |
| Baseline year requests select(*)                  |     123.9 |                  4097 |
| Optimized finance inbox page (zero matching rows) |     189.3 |                     2 |
| Optimized recent request projection (same 3 rows) |     121.0 |                  1637 |
| Exact submitted count HEAD                        |     118.2 |        no row payload |

The same-row projection reduces serialized data by about 60%, with no meaningful demonstrated latency gain on three rows. Inbox timings are not a like-for-like speed comparison because its filter matches zero rows. These are standalone REST probes using service role, **not authenticated route timings or RLS plans**. Exact counts and network latency can cost more than tiny scans. Current small data supports prioritizing blocking integration latency and development compilation, not claiming massive SQL speedups.

| Local HTTP smoke              | Development first / warm trial range (ms) | Production first / warm trial range (ms) |
| ----------------------------- | ----------------------------------------: | ---------------------------------------: |
| Login, 200                    |                       3314.4 / 76.4-326.9 |                        384.1 / 29.9-32.1 |
| Dashboard, 307 login redirect |                      1826.5 / 137.5-308.8 |                        118.8 / 20.9-23.9 |
| Requests, 307 login redirect  |                       450.5 / 142.3-147.4 |                         57.4 / 15.2-59.5 |
| Approvals, 307 login redirect |                       466.4 / 134.7-135.3 |                         40.1 / 15.3-65.1 |

Production and development were measured locally, without user cookies. Dev used the user's existing server on port 3000, left running; the temporary production server on 3100 was stopped. First-route compilation contributes to dev delay; warm dev overhead also remains. This is a mode comparison, not an optimization-before/after user-flow claim.

## Prioritized user flows

For all authenticated flows below, before/after end-to-end timings are **not measured**: no authenticated browser session was available. No fake successes, live finance mutations, email sends or authorization bypasses were used to get numbers.

| Flow                     | Baseline bottleneck                                                  | Change / measurement still needed                                                                                             |
| ------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A Login -> dashboard     | OAuth/Auth + three session reads + broad dashboard + dev compilation | Memoization retained; bounded dashboard. Unauthenticated login HTTP measured above; OAuth/session needs signed-in measurement |
| B Dashboard -> requests  | Entire year serialization + client filters                           | 25-row SQL list with filters; production signed-in RSC/TTFB measurement needed                                                |
| C Dashboard -> approvals | All requests before browser queue filtering                          | Decision-filtered 25-row SQL page; signed-in RSC/TTFB needed                                                                  |
| D Open request detail    | 13-18 reads in multiple waves                                        | Edit skips all supporting reads; full detail retained on tiny dataset; measure secondary records before splitting tabs        |
| E Submit request         | Drive + RPC + Sheets + email in response                             | Drive/RPC remain critical; Sheets/email after response; need Drive and committed response timings                             |
| F Approve                | RPC + Sheets/email + alert count/email                               | Response waits only critical DB work and revalidation; notifications afterward; measure action.total vs decision.integrations |
| G Reject                 | RPC + Sheets/email                                                   | Same post-commit separation; measure action.total                                                                             |
| H Return for revision    | RPC + Sheets/email                                                   | Same post-commit separation; measure action.total                                                                             |
| I Department budget      | Focused view on overview; department detail 9 reads                  | Overview already focused; detail remains a comprehensive finance view; measure with realistic ledger volume                   |
| J Record transaction     | RPC + sequential request/issue lookup + email                        | Atomic RPC unchanged; parallel alert reads afterward; measure action.total                                                    |

## Validation and practical limits

- Regression suite: 25 tests pass, including real PostgreSQL-compatible migration/RLS/finance workflow, exact arithmetic, authorization, statuses, register retries, and email failure after commit.
- Browser fixture suite: all applicant/admin workflows, decision queues, forms, old/closed years, page groups and mobile checks pass. New fixture loader simulates server filtering; the separately executed real loader test verifies SQL scope/range/count operations. Fixtures do not prove cloud delivery.
- Typecheck and production build pass; production client secret scan passes (24 assets at first build). No ESLint/lint script exists in this repo. Changed implementation files were checked with Prettier; this is formatting validation, not a substitute claim that ESLint ran.
- Live Drive submission and Gmail notification delivery require authenticated staging verification; existing behavior is covered with isolated regression fixtures, not real sends.
- `next-env.d.ts` updates its generated route type imports when building; this is Next-generated, not a hand-authored architecture change.

## Remaining measured/unmeasured bottlenecks

1. Full reports intentionally retain complete compilation/export semantics; still load the year and serialize CSV rows. A paginated report + RLS aggregate + on-demand streamed export is justified when volume grows; do not truncate records or totals. Existing Supabase default row limit can silently cap reports at high volume; test beyond that cap before production growth.
2. Department/project detail still render complete ledgers/supporting records. Project associations can span years, admin project user selector is unbounded. These are smaller current datasets; qualify with signed-in traces before larger refactors.
3. Request detail still performs multiple sequential waves on full view; notification/history growth may justify lazy secondary sections. Author IDs are fetched in a batch; no network N+1 on list rows.
4. Five revision attention items on dashboard are a preview; all revisions remain available through the request list. Revision comments are still read for those five IDs and may grow; measure history before adding a latest-comment RPC.
5. Auth proxy and server session each validate user (security retained); profile/domain/year/membership network latency remains. No global auth cache or RLS bypass was introduced.
6. Gmail token identity/scope validation remains per send, Resend sender context has multiple batched reference reads per recipient. They are outside response now, still consume function time. Sheets integration also consumes function duration; cron/retry remains necessary. after uses existing workspace maxDuration=60.
7. router.refresh calls retained where existing UX expects updated status/details; targeted server invalidation already avoids root layout purge for ordinary actions. Next docs state revalidatePath in server functions still refreshes previously visited pages on later navigation; targeted calls do not eliminate this framework behavior.
8. Browser network click/RSC traces, p50/p95 under realistic concurrent users, live indexes/EXPLAIN and all ten signed-in flow timings remain deployment measurements. No throughput or sub-second finance-action guarantee is claimed.

## Files changed

Page loading: src/lib/page-data.ts, src/lib/data.ts, src/lib/auth.ts, workspace dashboard/requests/approvals/admin/request-detail pages.

Interaction: src/components/request-list-controls.tsx, server-filter-form.tsx, audit-table.tsx, request-table.tsx. Existing interactive components stay client-side; full pages stay server-side.

Actions/integrations: src/app/actions.ts, src/lib/post-commit.ts, performance.ts, supabase/server.ts, google-auth.ts, google-drive.ts, gmail.ts, reconciliation.ts.

Database/verification: migration 006, scripts/setup-database.mjs, measure-performance.mjs, measure-routes.mjs, check-ux.mjs, tests/performance.test.ts, action-boundaries.test.ts, database.test.ts, tests/ui/fixtures.ts, generated next-env.d.ts, this audit and sanitized performance artifacts.

Automatic approval review rejected an optional attempt to restore test-file formatting from HEAD because overwriting the working tree could discard uncommitted work. That reset was not performed; the existing test file was preserved and validation continued.
