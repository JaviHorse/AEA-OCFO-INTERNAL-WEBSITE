import { cents, human, isFinance } from "./finance";
import type {
  FinanceRequest,
  Financial,
  Issue,
  RequestType,
  Role,
  Status,
} from "./types";

export function navigationFor(role: Role) {
  return isFinance(role)
    ? [
        "/dashboard",
        "/requests",
        "/approvals",
        "/departments",
        "/projects",
        "/reports",
        "/guide",
        ...(role === "CFO_ADMIN" ? ["/admin"] : []),
      ]
    : ["/dashboard", "/requests", "/projects", "/guide"];
}
export function requestTypeLabel(type: Pick<RequestType, "code" | "name">) {
  return [
    "PROJECT_END_REVENUE",
    "DISBURSEMENT_ACCREDITED",
    "DISBURSEMENT_UNACCREDITED",
  ].includes(type.code)
    ? human(type.code)
    : type.name;
}
export const requestDescriptions: Record<string, string> = {
  BUDGET_REQUEST:
    "Request funding for an upcoming department expense or activity.",
  BUDGET_CHANGE: "Ask to increase or reduce your department’s approved budget.",
  DISBURSEMENT_ACCREDITED:
    "Request payment to an accredited supplier before an expense is paid.",
  DISBURSEMENT_UNACCREDITED:
    "Request payment to a supplier who is not accredited.",
  REIMBURSEMENT:
    "Use this when someone already paid for an approved AEA expense and needs repayment.",
  BUDGET_TRANSFER:
    "Request a budget transfer for finance review. Explain the proposed transfer in your notes.",
  PROJECT_END_REVENUE:
    "Submit a completed project’s expense, revenue, and supporting records.",
};
export function statusStage(status: Status) {
  const indexes: Record<Status, number> = {
    DRAFT: -1,
    SUBMITTED: 0,
    UNDER_OCFO_REVIEW: 1,
    NEEDS_REVISION: 1,
    READY_FOR_CFO: 2,
    APPROVED: 2,
    PROCESSING: 3,
    COMPLETED: 4,
    REJECTED: -1,
    CANCELLED: -1,
  };
  return indexes[status];
}
export function nextStep(status: Status, admin: boolean) {
  const member: Record<Status, string> = {
    DRAFT: "Add your details and documents, then submit your request.",
    SUBMITTED:
      "Finance will review the documents you submitted. No action is needed from you right now.",
    UNDER_OCFO_REVIEW:
      "Finance is reviewing your submitted documents. No action is needed from you right now.",
    NEEDS_REVISION:
      "Finance needs you to make changes before your request can continue. Read the feedback, update your request, and resubmit.",
    READY_FOR_CFO:
      "Your request is waiting for Finance approval. No action is needed from you right now.",
    APPROVED: "Finance approved your request.",
    PROCESSING: "Finance approved your request.",
    COMPLETED: "Finance approved your request.",
    REJECTED:
      "This request was not approved. Read the decision in its history.",
    CANCELLED: "This request was cancelled and is closed.",
  };
  if (!admin) return member[status];
  return (
    (
      {
        DRAFT: "The member has not submitted this draft yet.",
        SUBMITTED: "Begin review and check the submitted documents.",
        UNDER_OCFO_REVIEW:
          "Verify the documents and leave feedback for the approving Administrator.",
        NEEDS_REVISION:
          "Waiting for the applicant to update and resubmit this request.",
        READY_FOR_CFO:
          "This request is ready for a Finance decision. Review the documents and budget impact before deciding.",
      } as Partial<Record<Status, string>>
    )[status] ?? member[status]
  );
}
export function financialHealth(f: Financial, issues: Issue[]) {
  if (cents(f.available_funds) < 0n) return "Over Budget";
  if (
    issues.some(
      (i) =>
        i.department_id === f.department_id &&
        i.status === "OPEN" &&
        i.severity === "CRITICAL",
    )
  )
    return "Needs Review";
  if (
    cents(f.current_budget) > 0n &&
    cents(f.available_funds) * 10n <= cents(f.current_budget)
  )
    return "Near Limit";
  return "Healthy";
}
export function approvalAvailable(
  f: Financial | undefined,
  r: Pick<FinanceRequest, "amount" | "status">,
  type: Pick<RequestType, "creates_commitment" | "code">,
) {
  const before = cents(f?.available_funds ?? "0");
  if (
    ["APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "CANCELLED"].includes(
      r.status,
    )
  )
    return before;
  if (type.code === "BUDGET_CHANGE") return before + cents(r.amount);
  if (type.code === "BUDGET_REQUEST")
    return before + cents(r.amount) - cents(f?.initial_approved_budget ?? "0");
  return type.creates_commitment ? before - cents(r.amount) : before;
}
export type AttentionItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  critical?: boolean;
};
export function applicantAttention(
  requests: FinanceRequest[],
  issues: Issue[],
  readOnly: boolean,
): AttentionItem[] {
  if (readOnly) return [];
  const editable = (r: FinanceRequest) =>
    ["DRAFT", "NEEDS_REVISION"].includes(r.status);
  const items: AttentionItem[] = requests
    .filter((r) => r.status === "NEEDS_REVISION")
    .map((r) => ({
      id: r.id,
      title: `${r.reference_code ?? r.title} needs revision`,
      description:
        "Read the finance team’s message, update your details or documents, and resubmit.",
      href: `/requests/${r.id}`,
      action: "Fix Request",
    }));
  for (const issue of issues.filter(
    (i) =>
      i.status === "OPEN" &&
      /MISSING_DOCUMENT|DRIVE|SOURCE_FOLDER|PROJECT_END_OVERDUE/.test(i.code),
  )) {
    const r = requests.find((r) => r.id === issue.entity_id);
    items.push({
      id: issue.id,
      title: /PROJECT_END_OVERDUE/.test(issue.code)
        ? "Project-end report overdue"
        : /DRIVE/.test(issue.code)
          ? "Your documents need attention"
          : "A required document needs attention",
      description: issue.description,
      href: r ? `/requests/${r.id}` : `/projects/${issue.entity_id}`,
      action: r
        ? editable(r)
          ? "Fix Request"
          : "Open Request"
        : "Open Project",
    });
  }
  return items;
}
export function notificationText(event: string) {
  if (event.startsWith("REQUEST_")) event = event.slice("REQUEST_".length);
  const messages: Record<string, string> = {
    NEW_SUBMISSION: "A new finance request is ready for review.",
    SUBMISSION_CONFIRMATION: "Your finance request has been submitted.",
    UNDER_OCFO_REVIEW: "Your request is now under Finance review.",
    NEEDS_REVISION: "Your request needs revision.",
    READY_FOR_CFO: "A request is ready for Finance approval.",
    APPROVED: "Your request has been approved.",
    REJECTED: "Your request was not approved.",
    CANCELLED: "Your request has been cancelled.",
    PROCESSING: "Your request is now being processed.",
    COMPLETED: "Your request is complete.",
    MISSING_REQUIRED_DOCUMENT: "A required document needs your attention.",
    CRITICAL_DISCREPANCY: "A critical finance issue needs review.",
    PROJECT_END_OVERDUE: "Your project-end report is overdue.",
    PROJECT_END_DUE_SOON: "Your project-end report is due soon.",
  };
  return messages[event] ?? `Finance update: ${human(event)}.`;
}
