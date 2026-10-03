import type { FinanceRequest, RequestType } from "./types";
import { cents } from "./finance";
import { requestDecision } from "./request-decisions";

export function requestTypeSummaries(requests: FinanceRequest[], types: RequestType[]) {
  const submitted = requests.filter(r => r.status !== "DRAFT");
  const allTypes = new Map(types.map(type => [type.id, type]));
  for (const request of submitted) if (!allTypes.has(request.request_type_id)) {
    allTypes.set(request.request_type_id, { id: request.request_type_id, code: "", name: "Archived request type", is_active: false } as RequestType);
  }
  return [...allTypes.values()].map(type => {
    const records = submitted.filter(r => r.request_type_id === type.id)
      .sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at));
    const count = (decision: string) => records.filter(r => requestDecision(r.status) === decision).length;
    return { type, records, count: records.length, amount: records.reduce((n, r) => n + cents(r.amount), 0n),
      approved: count("APPROVED"), rejected: count("REJECTED"), incomplete: count("NEEDS_REVISION"),
      pending: records.filter(r => !requestDecision(r.status) && r.status !== "CANCELLED").length,
      withdrawn: records.filter(r => r.status === "CANCELLED").length };
  });
}
