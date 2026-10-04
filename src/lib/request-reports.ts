import type { FinanceRequest, RequestType } from "./types";
import { cents } from "./finance";
import { requestDecision } from "./request-decisions";

export type ReportRequest = Pick<
  FinanceRequest,
  "request_type_id" | "status" | "amount"
>;
export function requestSummaryAccumulator(types: RequestType[]) {
  const make = (type: RequestType) => ({
    type,
    count: 0,
    amount: 0n,
    approved: 0,
    rejected: 0,
    incomplete: 0,
    pending: 0,
    withdrawn: 0,
  });
  const groups = new Map(types.map((t) => [t.id, make(t)]));
  return {
    add(records: ReportRequest[]) {
      for (const r of records) {
        if (r.status === "DRAFT") continue;
        if (!groups.has(r.request_type_id))
          groups.set(
            r.request_type_id,
            make({
              id: r.request_type_id,
              code: "",
              name: "Archived request type",
              is_active: false,
            } as RequestType),
          );
        const group = groups.get(r.request_type_id)!;
        group.count++;
        group.amount += cents(r.amount);
        const decision = requestDecision(r.status);
        if (decision === "APPROVED") group.approved++;
        else if (decision === "REJECTED") group.rejected++;
        else if (decision === "NEEDS_REVISION") group.incomplete++;
        else if (r.status === "CANCELLED") group.withdrawn++;
        else group.pending++;
      }
    },
    values: () => [...groups.values()],
  };
}
export function requestTypeSummaries(
  requests: ReportRequest[],
  types: RequestType[],
) {
  const summary = requestSummaryAccumulator(types);
  summary.add(requests);
  return summary.values();
}
