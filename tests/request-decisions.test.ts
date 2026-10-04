import { test } from "node:test";
import assert from "node:assert/strict";
import { statuses } from "../src/lib/types";
import {
  decisionLabel,
  isRequestInbox,
  requestDecision,
} from "../src/lib/request-decisions";
import { visibleTargets } from "../src/lib/finance";

test("inbox and decisions never overlap; legacy paid requests retain Approved outcome", () => {
  for (const status of statuses)
    assert(!(isRequestInbox(status) && requestDecision(status)));
  for (const status of ["APPROVED", "PROCESSING", "COMPLETED"] as const)
    assert.equal(decisionLabel(status), "Approved");
  assert.equal(decisionLabel("REJECTED"), "Rejected");
  assert.equal(decisionLabel("NEEDS_REVISION"), "Incomplete");
  assert(isRequestInbox("SUBMITTED"));
  assert(!isRequestInbox("NEEDS_REVISION"));
  assert.equal(requestDecision("SUBMITTED"), null);
});
test("administrators decide with three outcomes and OCFO retains review-only access", () => {
  assert.deepEqual(visibleTargets("SUBMITTED", "CFO_ADMIN"), [
    "APPROVED",
    "NEEDS_REVISION",
    "REJECTED",
  ]);
  assert.deepEqual(visibleTargets("APPROVED", "CFO_ADMIN"), []);
  assert.deepEqual(visibleTargets("SUBMITTED", "OCFO_MEMBER"), []);
});
