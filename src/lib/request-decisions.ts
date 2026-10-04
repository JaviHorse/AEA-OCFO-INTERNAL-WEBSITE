import type { Status } from "./types";

export const decisionStatuses = ["APPROVED", "REJECTED", "NEEDS_REVISION"] as const;
export function requestDecision(status: Status) {
  if (["APPROVED", "PROCESSING", "COMPLETED"].includes(status)) return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  if (status === "NEEDS_REVISION") return "NEEDS_REVISION";
  return null;
}
export function isRequestInbox(status: Status) {
  return ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(status);
}
export function decisionLabel(status: Status) {
  const decision = requestDecision(status);
  return decision === "NEEDS_REVISION" ? "Incomplete" : decision === "APPROVED" ? "Approved" : decision === "REJECTED" ? "Rejected" : "";
}
