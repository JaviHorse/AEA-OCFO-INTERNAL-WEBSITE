import { test } from "node:test";
import assert from "node:assert/strict";
import { requestTypeSummaries } from "../src/lib/request-reports";
import type { FinanceRequest, RequestType } from "../src/lib/types";

test("request summaries use exact amounts, exclude drafts and retain all submitted outcomes by type", () => {
  const types = [{ id: "reimbursement", name: "Reimbursement", code: "REIMBURSEMENT" }, { id: "budget", name: "Budget Change", code: "BUDGET_CHANGE" }] as RequestType[];
  const records = [
    ["reimbursement", "SUBMITTED", "0.10"], ["reimbursement", "COMPLETED", "0.20"],
    ["reimbursement", "REJECTED", "1.00"], ["reimbursement", "NEEDS_REVISION", "2.00"],
    ["reimbursement", "CANCELLED", "3.00"], ["reimbursement", "DRAFT", "999.00"],
    ["budget", "APPROVED", "-10.25"], ["retired", "APPROVED", "4.00"],
  ].map(([request_type_id, status, amount], i) => ({ id: String(i), request_type_id, status, amount, created_at: "2026-10-03T00:00:00Z" })) as FinanceRequest[];
  const groups = requestTypeSummaries(records, types);
  const reimbursement = groups[0];
  assert.equal(reimbursement.count, 5);
  assert.equal(reimbursement.amount, 630n);
  assert.deepEqual([reimbursement.pending, reimbursement.approved, reimbursement.rejected, reimbursement.incomplete, reimbursement.withdrawn], [1, 1, 1, 1, 1]);
  assert.equal(groups[1].amount, -1025n);
  assert.equal(groups[2].records.length, 1);
  assert.equal(requestTypeSummaries([], types)[0].count, 0);
});
