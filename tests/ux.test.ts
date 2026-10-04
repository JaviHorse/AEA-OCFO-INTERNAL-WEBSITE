import { test } from "node:test";
import assert from "node:assert/strict";
import {
  navigationFor,
  statusStage,
  approvalAvailable,
  financialHealth,
  applicantAttention,
  notificationText,
} from "../src/lib/ux";
import { human } from "../src/lib/finance";
import type { FinanceRequest, Financial, Issue } from "../src/lib/types";
test("navigation separates applicant, OCFO, and CFO tasks", () => {
  assert.deepEqual(navigationFor("DEPARTMENT_MEMBER"), [
    "/dashboard",
    "/requests",
    "/projects",
    "/guide",
  ]);
  assert.deepEqual(
    navigationFor("PROJECT_MEMBER"),
    navigationFor("DEPARTMENT_MEMBER"),
  );
  assert(!navigationFor("OCFO_MEMBER").includes("/admin"));
  assert(navigationFor("CFO_ADMIN").includes("/admin"));
});
test("timeline does not show rejected or cancelled requests as completed", () => {
  assert.equal(statusStage("COMPLETED"), 4);
  assert.equal(statusStage("NEEDS_REVISION"), 1);
  assert.equal(statusStage("REJECTED"), -1);
  assert.equal(statusStage("CANCELLED"), -1);
  assert.equal(human("READY_FOR_CFO"), "For Approval");
  assert.equal(human("UNDER_OCFO_REVIEW"), "Under Finance Review");
});
test("approval preview handles reservations, budget changes, and existing approval", () => {
  const financial = {
    available_funds: "500.00",
    initial_approved_budget: "0.00",
  } as Financial;
  const request = {
    amount: "600.00",
    status: "READY_FOR_CFO",
  } as FinanceRequest;
  assert.equal(
    approvalAvailable(financial, request, {
      creates_commitment: true,
      code: "REIMBURSEMENT",
    }),
    -10000n,
  );
  assert.equal(
    approvalAvailable(
      financial,
      { ...request, status: "APPROVED" },
      { creates_commitment: true, code: "REIMBURSEMENT" },
    ),
    50000n,
  );
  assert.equal(
    approvalAvailable(
      financial,
      { ...request, amount: "-100.00" },
      { creates_commitment: false, code: "BUDGET_CHANGE" },
    ),
    40000n,
  );
  assert.equal(
    approvalAvailable(financial, request, {
      creates_commitment: false,
      code: "PROJECT_END_REVENUE",
    }),
    50000n,
  );
  assert.equal(
    approvalAvailable(financial, request, {
      creates_commitment: false,
      code: "BUDGET_REQUEST",
    }),
    110000n,
  );
});
test("attention links lead to a request or project and closed years suppress edit tasks", () => {
  const request = {
    id: "request",
    reference_code: "AEA-2627-0041",
    status: "NEEDS_REVISION",
  } as FinanceRequest;
  const issues = [
    {
      id: "report",
      status: "OPEN",
      code: "PROJECT_END_OVERDUE",
      entity_id: "project",
      description: "Report is overdue.",
    },
    {
      id: "internal",
      status: "OPEN",
      code: "LEDGER_MISMATCH",
      entity_id: "request",
    },
  ] as Issue[];
  const attention = applicantAttention([request], issues, false);
  assert.equal(attention.length, 2);
  assert.equal(attention[0].href, "/requests/request");
  assert.equal(attention[1].href, "/projects/project");
  assert.deepEqual(applicantAttention([request], issues, true), []);
});
test("health includes text meaning and notifications do not expose status codes", () => {
  const financial = {
    department_id: "dept",
    current_budget: "1000.00",
    available_funds: "100.00",
  } as Financial;
  assert.equal(financialHealth(financial, []), "Near Limit");
  assert.equal(
    financialHealth({ ...financial, available_funds: "-1.00" }, []),
    "Over Budget",
  );
  assert.equal(
    notificationText("NEEDS_REVISION"),
    "Your request needs revision.",
  );
  assert(!notificationText("UNDER_OCFO_REVIEW").includes("UNDER_OCFO_REVIEW"));
});
