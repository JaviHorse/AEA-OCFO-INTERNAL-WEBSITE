import "server-only";
import { workspace } from "./data";
import { yearContext } from "./auth";
import { isFinance } from "./finance";
import { withTiming } from "./performance";
import type { FinanceRequest } from "./types";

import type { RequestFilters } from "./request-filters";
export type { RequestFilters } from "./request-filters";
export const requestListColumns =
  "id,reference_code,fiscal_year_id,department_id,project_id,request_type_id,requester_user_id,title,amount,status,created_at,submitted_at,updated_at";
const inbox = ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"];
const decisions = [
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "NEEDS_REVISION",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function pageNumber(value?: string) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100000) : 1;
}
function scopedRequests(
  w: Pick<
    Awaited<ReturnType<typeof workspace>>,
    "db" | "year" | "yearRole" | "yearMemberships"
  >,
  counted = true,
) {
  const q = w.db
    .from("requests")
    .select(requestListColumns, counted ? { count: "exact" } : {})
    .eq("fiscal_year_id", w.year.id);
  if (!w.yearRole || !isFinance(w.yearRole))
    q.in(
      "department_id",
      w.yearMemberships
        .filter((m) => m.role === "DEPARTMENT_MEMBER")
        .slice(0, 1)
        .map((m) => m.department_id),
    );
  return q;
}
export async function getRequestListData(
  p: RequestFilters,
  queue: "all" | "inbox" | "decisions",
) {
  return withTiming("requests.total", async () => {
    const w = await workspace(p.year, [
      "departments",
      "requestTypes",
      "projects",
    ]);
    const finance = !!w.yearRole && isFinance(w.yearRole);
    const actualQueue = queue === "all" && finance ? "inbox" : queue;
    const q = scopedRequests(w);
    if (actualQueue === "inbox") q.in("status", inbox);
    if (actualQueue === "decisions") q.in("status", decisions);
    if (p.status) {
      const states =
        p.status === "pending"
          ? [...inbox, "APPROVED", "PROCESSING"]
          : p.status === "action"
            ? finance
              ? inbox
              : ["DRAFT", "NEEDS_REVISION"]
            : p.status === "APPROVED" && actualQueue !== "inbox"
              ? ["APPROVED", "PROCESSING", "COMPLETED"]
              : [p.status];
      q.in("status", states);
    }
    for (const [key, column] of [
      ["department", "department_id"],
      ["project", "project_id"],
    ] as const) {
      if (p[key] && uuid.test(p[key]!)) q.eq(column, p[key]!);
    }
    if (p.type) {
      const ids = w.requestTypes
        .filter(
          (t) =>
            t.id === p.type ||
            t.code === p.type ||
            (p.type === "DISBURSEMENTS" && t.code.startsWith("DISBURSEMENT")),
        )
        .map((t) => t.id);
      q.in("request_type_id", ids);
    }
    const page = pageNumber(p.page);
    const result = await q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 25, page * 25 - 1);
    if (result.error) throw new Error("Requests could not be loaded.");
    return {
      ...w,
      requests: (result.data ?? []) as FinanceRequest[],
      count: result.count ?? 0,
      page,
      queue: actualQueue,
    };
  });
}
export async function getDashboardData(year?: string) {
  return withTiming("dashboard.total", async () => {
    const w = await yearContext(year);
    const references = workspace(year, [
      "departments",
      "financials",
      "requestTypes",
    ]);
    const count = async (states: string[]) => {
      const q = w.db
        .from("requests")
        .select("id", { count: "exact", head: true })
        .eq("fiscal_year_id", w.year.id)
        .in("status", states);
      if (!w.yearRole || !isFinance(w.yearRole))
        q.in(
          "department_id",
          w.yearMemberships
            .filter((m) => m.role === "DEPARTMENT_MEMBER")
            .slice(0, 1)
            .map((m) => m.department_id),
        );
      const r = await q;
      if (r.error) throw new Error("Request counters could not be loaded.");
      return r.count ?? 0;
    };
    const finance = isFinance(w.role);
    const [
      referenceRecords,
      recent,
      revisions,
      pending,
      submitted,
      ready,
      revisionCount,
    ] = await Promise.all([
      references,
      scopedRequests(w, false)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5),
      finance
        ? Promise.resolve({ data: [], error: null })
        : scopedRequests(w, false)
            .eq("status", "NEEDS_REVISION")
            .order("created_at", { ascending: false })
            .limit(5),
      finance
        ? Promise.resolve(0)
        : count([...inbox, "APPROVED", "PROCESSING"]),
      finance ? count(["SUBMITTED"]) : Promise.resolve(0),
      finance ? count(["READY_FOR_CFO"]) : Promise.resolve(0),
      finance ? count(["NEEDS_REVISION"]) : Promise.resolve(0),
    ]);
    if (recent.error || revisions.error)
      throw new Error("Recent requests could not be loaded.");
    return {
      ...referenceRecords,
      requests: recent.data as FinanceRequest[],
      revisions: revisions.data as FinanceRequest[],
      pending,
      submitted,
      ready,
      revisionCount,
    };
  });
}
