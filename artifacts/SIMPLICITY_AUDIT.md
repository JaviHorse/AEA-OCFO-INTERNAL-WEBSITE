# AEA Finance simplicity audit

Implemented the supplied requirements in sections 41–68. The default interface now emphasizes the next task, with occasional controls inside tabs or disclosures.

| Screen | Final simplicity pass |
| --- | --- |
| Member navigation | Dashboard, Requests, Projects, Help & Requirements. Profile remains in the account area. |
| Admin navigation | Existing major work areas retained; no new global entity pages. |
| Member dashboard | Available budget, pending requests when present, actionable revisions, recent requests. Removed onboarding and duplicate counters. |
| Admin dashboard | New Requests and For Approval, critical Finance Issues when present, one financial summary, recent requests. Removed request-category cards. |
| Member requests | Search, Status, Project; dates inside More filters. Six table columns and no repeated department/requester. |
| Admin requests | Search, Status, Department, Type; project/requester/dates inside More filters. Seven table columns. Removed both rows of filter pills. |
| New request / revision | Retained the four-step form, locked department, exact conditional requirements, folder validation and review. Shortened headings and redundant hints. |
| Member request detail | One edit action, short next step, summary, Documents, Messages, History. Cancel remains secondary. No document verification inputs or private finance notes. |
| Admin request detail / approval entry | Overview with decision and available balances; Documents and Messages tabs; reviews, budget breakdown, transactions, history, audit and issue entry under More Details. Removed the duplicate expanded approval layout. |
| Approvals | Six-column decision queue: Department, Type, Amount, Submitted, Issues, Review. Detailed budget/document information is on the request. Removed unnecessary list queries for people, document checks and budget previews. |
| Department Budgets | Allocation table with drill-down; fiscal year appears in the shared selector. |
| Department budget / department detail | One financial summary with Requests, Budget Changes, Transactions, Projects and Finance Issues tabs. |
| Departments | Small directory table; financial totals belong in Department Budgets and detail. |
| Transactions | Ledger first by default; Record Transaction explicitly opens its compact entry section. Project/request/date filters collapsed. |
| Reports | Financial summary first. Department summaries, commitments, issues and project reports are collapsible; issue/project deep links open the relevant section. |
| Projects | Name, status, departments and Open; Administrator Add Project action. Removed date/description noise and unrelated request creation in empty state. |
| Project detail | Overview and linked requests first; financial activity and reports collapsed. One explanation of department budget ownership. |
| Help & Requirements | Request requirements are accordions. Drive instructions, statuses, FAQ and published guides stay collapsed. Editing remains available to Finance. |
| Administration | Six main groups: Members, Fiscal Years, Departments, Request Setup, Settings, System Logs. Projects, requirements and logs use secondary navigation. Creation and occasional editing forms are disclosed explicitly. |
| Login / registration | Shortened instructions while retaining account eligibility and registration safeguards. |
| Profile | Identity, department and account type; removed repeated fiscal-year context. |
| Error / access / missing record | Short recovery instructions and clear actions. Administrator diagnostics remain secondary. |
| Shared shell / progress | Removed duplicate page headings from the top bar and repeated status prose from progress. Consistent disclosure spacing, readable filters, responsive summaries and scrollable navigation. |

Removed the unused onboarding and department-filter components. Existing financial commands, authorization, RLS, audit, Drive archival and notifications remain intact. This frontend change needs no database migration.

Validation:

- 17 automated finance, database, authorization and unit tests passed.
- 12 browser scenario groups passed, including real page/component rendering for all major areas and Administration groups, submission, revision, document verification, comment privacy, approval confirmation, closed years, collapsed forms and mobile layout.
- Production build passed, including TypeScript validation.
- Client credential scan passed; no configured server credentials appeared in client assets.
- Visual review completed for member/admin dashboards, mobile dashboard, approvals and requirements.

Browser checks use isolated local data/action fixtures and do not write to Supabase, Google Drive or email. Screenshots and test results are in `artifacts/ux-review/`.
