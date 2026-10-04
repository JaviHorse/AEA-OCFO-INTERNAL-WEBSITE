# AEA Finance usability refinement

## Initial audit

The existing shell, panels, fields, badges, request register, review controls,
server actions, finance RPCs, RLS, archival, and notification delivery were reused.
The main gaps were identical navigation for all roles, finance-heavy applicant
screens, a single large request form, raw labels, and ten-table loading on every
page.

Project membership remains supplemental. It does not grant department access.
Folder access does not prove document completeness; OCFO verification remains
explicit. Budget calculations and approval enforcement remain server-authoritative.

## Implemented

- Department navigation: Dashboard, Requests, Projects, Help & Requirements.
  OCFO retains finance pages. Administration remains CFO-only.
- Fiscal year, role, and department are visible in the shell. Mobile navigation
  has an overlay, close action, and expanded state.
- Applicants see Current Budget, Spent, Committed, Available, a utilization bar,
  direct actions, department follow-ups, and recent requests.
- Finance users see organization metrics, filtered workload links, and department
  health labels. Report and department destinations honor the queue filters.
- Request creation and revision use four steps, department-linked projects,
  conditional PDAF guidance, friendly folder checks, and a review summary.
  Folder checks and submission still use the existing server actions.
- Request detail has a status timeline. Applicant views focus on follow-ups,
  summary, documents, messages, and expandable history. Finance views group
  documents, OCFO review, budget impact, transactions, and history/audit.
- Approval warnings calculate available funds with exact monetary arithmetic.
  Missing required-document checks cannot be masked by verified optional files.
  Existing CFO decision and override rules remain enforced by the RPC.
- Finance comments default to private internal notes. Visibility is explicit and
  resets to the safe default after posting. Internal notes remain protected by RLS.
- Request tables have human status labels, quick filters, collapsible advanced
  filters, dates, requester/review information for finance, and 25-row display pages.
- Help includes request-type explanations, requirements, conditional documents,
  process summaries, start links, statuses, and FAQs.
- Administration separates Request Types and Document Requirements, improves
  year setup guidance, removes unused raw workflow configuration from the UI,
  and preserves its stored value when editing request types.
- Project members show available names/emails rather than UUIDs. Profiles that
  existing permissions do not reveal are labelled unavailable; access is not expanded.
- Notification subjects and bodies describe the status in plain language.
- Confirmation dialogs use native modal focus behavior. Inputs have explicit
  labels and helper descriptions; tabs support arrow keys; statuses use text.
- Page loaders request selected datasets, use department/request/project filters,
  and deduplicate reference reads within an authenticated render. Reference data
  is never cached across users. Small client-side filter/step changes do not fetch
  the entire workspace.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: production build passed for all existing routes.
- `npm test`: 14 tests passed, including actual Postgres/PGlite finance workflow,
  RLS isolation, private comments, project access, closed years, precise amounts,
  PDAF boundaries, OAuth classification, role navigation, and recorded page queries.
- `npm run test:ux`: 9 browser scenario groups passed. These exercise the real
  pages/components with isolated data/action adapters, including scenarios A–G,
  closed years, filters, and 390px mobile screens. They do not bypass application
  authentication or write to Supabase, Drive, or email.
- The running local application passed login rendering, unauthenticated dashboard
  redirect, access-denied rendering, and mobile overflow checks.
- `npm run check:security`: 23 client assets checked; no configured server secrets
  were found in client output.

Browser report: `artifacts/ux-review/results.json`.
Screenshots: `artifacts/ux-review/department-dashboard.png`,
`artifacts/ux-review/department-mobile.png`, and
`artifacts/ux-review/request-review.png`.

No database migration, cloud deployment, or live request submission was performed
for this UX pass. Live authenticated OAuth, Drive archival, and email delivery were
not re-exercised with real officer accounts. The financial/security implementation
and existing permission boundary remain in place.
