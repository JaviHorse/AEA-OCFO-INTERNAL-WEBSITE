import type { Requirement, Role, Status } from "./types";
export function cents(value: string | number): bigint {
  const text = String(value);
  if (!/^-?\d+(\.\d{1,2})?$/.test(text))
    throw new Error("Enter a monetary amount with at most two decimal places.");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function decimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const n = value < 0n ? -value : value;
  return `${sign}${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function money(value: string | number | bigint): string {
  const n = typeof value === "bigint" ? value : cents(value);
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;
  return `${sign}₱${(abs / 100n).toLocaleString("en-PH")}.${String(abs % 100n).padStart(2, "0")}`;
}
export function available(
  budget: string,
  expenses: string,
  commitments: string,
) {
  return decimal(cents(budget) - cents(expenses) - cents(commitments));
}
export function requiredDocuments(list: Requirement[], amount: string) {
  return list.filter(
    (r) =>
      !r.condition_type ||
      (r.condition_type === "AMOUNT_LT" &&
        cents(amount) < cents(r.condition_json?.amount ?? 15000)),
  );
}
export const isFinance = (role: Role) =>
  role === "CFO_ADMIN" || role === "OCFO_MEMBER";
const labels: Record<string, string> = {
  CFO_ADMIN: "Finance Administrator",
  OCFO_MEMBER: "Finance Administrator",
  DEPARTMENT_MEMBER: "Member",
  PROJECT_MEMBER: "Member",
  UNDER_OCFO_REVIEW: "Under Finance Review",
  NEEDS_REVISION: "Incomplete",
  PROCESSING: "Approved",
  COMPLETED: "Approved",
  READY_FOR_CFO: "For Approval",
  INTERNAL_OCFO: "Internal Finance Note",
  REQUESTER_VISIBLE: "Message to Department",
  PROJECT_END_REVENUE: "Project-End / Revenue Submission",
  DISBURSEMENT_ACCREDITED: "Accredited Disbursement",
  DISBURSEMENT_UNACCREDITED: "Unaccredited Disbursement",
  PENDING_REVIEW: "Pending Review",
  HAS_COMMENTS: "Changes Suggested",
  NONE: "No Recommendation",
  REVISION: "Request Revision",
  FAILED: "Needs Attention",
  PENDING: "Pending",
};
export const human = (value: string) =>
  labels[value] ??
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export function allowedTargets(status: Status, role: Role): Status[] {
  if (["COMPLETED", "REJECTED", "CANCELLED"].includes(status)) return [];
  const result: Status[] = [];
  if (isFinance(role) && status === "SUBMITTED")
    result.push("UNDER_OCFO_REVIEW");
  if (isFinance(role) && ["SUBMITTED", "UNDER_OCFO_REVIEW"].includes(status))
    result.push("READY_FOR_CFO");
  if (
    role === "CFO_ADMIN" &&
    ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(status)
  )
    result.push("APPROVED", "NEEDS_REVISION", "REJECTED");
  if (role === "CFO_ADMIN" && status === "APPROVED")
    result.push("PROCESSING", "COMPLETED");
  if (role === "CFO_ADMIN" && status === "PROCESSING") result.push("COMPLETED");
  if (
    role === "CFO_ADMIN" ||
    (role !== "PROJECT_MEMBER" &&
      ["DRAFT", "SUBMITTED", "NEEDS_REVISION"].includes(status))
  )
    result.push("CANCELLED");
  return result;
}
export function visibleTargets(status: Status, role: Role): Status[] {
  return allowedTargets(status, role).filter(
    (target) =>
      !isFinance(role) ||
      ["APPROVED", "REJECTED", "NEEDS_REVISION"].includes(target),
  );
}
