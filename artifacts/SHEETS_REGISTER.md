# Finance request register

All submitted request types record to AEA FIN / Sheet1:
https://docs.google.com/spreadsheets/d/14jREzzAI_Wi_EpLbdK2x_3sN5TNDIc3XCmp01l7jLGo/edit#gid=0

Columns: Reference | Request | Amount | Status | Updated | Action.
Reference opens the application request. Action opens the original submitted Drive folder. The Request cell note includes department, requester, email, request type and project. Finance reviewers still verify the document checklist in the application. Applicants must share their original folder with reviewers and the service account.

Supabase remains authoritative for approvals, access and budgets. Editing the sheet does not approve a request. Drive copying, official folder links and copy-dependent approval checks were removed; historical database records remain intact.

## Activation
1. Enable Google Sheets API in the existing service account project:
   https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=mineral-hangar-501207-d7
2. Run supabase/migrations/005_google_sheets_register.sql in the existing Supabase project SQL Editor. This migration is additive and safe to rerun. Do not rerun the full fresh-install script.
3. Run npm run check:register. Both checks must pass.
4. Submit a request or use Retry Sheets Recording on a Finance request. The existing reconcile cron also processes queued requests in batches, including previously submitted requests backfilled by the migration. Ensure that cron is scheduled in the deployment.

The local environment already points to this workbook and tab 0. Keep using .env.local.

Latest live verification on 2026-10-03: Sheets access and the database retry queue both pass. Ran the sync for the two queued requests and verified two populated references in the sheet. Use `npm run sync:register` to process outstanding requests manually; retries reuse existing references.

Verification: 19 automated tests passed, including database migrations and RLS, document requirements, register retry idempotency and sorted-row handling. Production build passed; client credential scan passed.
