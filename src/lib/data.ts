import "server-only";
import { withTiming } from "./performance";
import { cache } from "react";
import { yearContext } from "./auth";
import { isFinance } from "./finance";
import type {
  Department,
  Financial,
  FinanceRequest,
  RequestType,
  Project,
  Transaction,
  Issue,
  Requirement,
} from "./types";
export type Dataset =
  | "departments"
  | "financials"
  | "requests"
  | "requestTypes"
  | "projects"
  | "transactions"
  | "issues"
  | "requirements"
  | "years"
  | "projectDepartments";
// Deduplicate reference reads only within this authenticated render. Never share
// a cached Supabase response across users or bypass its row-level policies.
export const referenceData = cache(
  async (
    yearId: string,
    key: "departments" | "requestTypes" | "requirements" | "years",
  ) => {
    const ctx = await yearContext(yearId);
    const db = ctx.db;
    if (key === "requestTypes")
      return await db.from("request_types").select("*").order("name");
    if (key === "requirements")
      return await db
        .from("document_requirements")
        .select("*")
        .order("display_order");
    if (key === "years")
      return await db
        .from("fiscal_years")
        .select("*")
        .order("start_date", { ascending: false });
    const query = db.from("departments").select("*").order("code");
    if (!ctx.yearRole || !isFinance(ctx.yearRole))
      query.in(
        "id",
        ctx.yearMemberships
          .filter((m) => m.role === "DEPARTMENT_MEMBER")
          .slice(0, 1)
          .map((m) => m.department_id),
      );
    return await query;
  },
);
async function loadWorkspace(
  yearId?: string,
  datasets?: Dataset[],
  filter: {
    departmentId?: string;
    requestId?: string;
    projectId?: string;
    page?: number;
  } = {},
) {
  const ctx = await yearContext(yearId);
  const db = ctx.db;
  const finance = !!ctx.yearRole && isFinance(ctx.yearRole);
  const departmentIds = ctx.yearMemberships
    .filter((m) => m.role === "DEPARTMENT_MEMBER")
    .slice(0, 1)
    .map((m) => m.department_id);
  const wanted = (key: Dataset) => !datasets || datasets.includes(key);
  const empty = Promise.resolve({ data: [], error: null });
  const scope = <
    T extends {
      in(column: string, values: string[]): T;
      eq(column: string, value: string): T;
    },
  >(
    query: T,
  ): T => {
    const scoped = finance ? query : query.in("department_id", departmentIds);
    return filter.departmentId
      ? scoped.eq("department_id", filter.departmentId)
      : scoped;
  };
  const requestQuery = db
    .from("requests")
    .select("*", { count: "exact" })
    .eq("fiscal_year_id", ctx.year.id)
    .order("created_at", { ascending: false })
    .order("id");
  const transactionsQuery = db
    .from("transactions")
    .select("*", { count: "exact" })
    .eq("fiscal_year_id", ctx.year.id)
    .order("transaction_date", { ascending: false })
    .order("id");
  const issuesQuery = db
    .from("discrepancies")
    .select("*", { count: "exact" })
    .eq("fiscal_year_id", ctx.year.id)
    .order("detected_at", { ascending: false })
    .order("id");
  if (filter.projectId) {
    requestQuery.eq("project_id", filter.projectId);
    transactionsQuery.eq("project_id", filter.projectId);
  }
  if (filter.requestId) {
    transactionsQuery.eq("request_id", filter.requestId);
    issuesQuery.eq("entity_id", filter.requestId);
  }
  if (filter.page !== undefined) {
    const offset = (Math.max(1, filter.page) - 1) * 50;
    requestQuery.range(offset, offset + 49);
    transactionsQuery.range(offset, offset + 49);
    issuesQuery.range(offset, offset + 49);
  }
  const projectsQuery = db
    .from("projects")
    .select("*", { count: "exact" })
    .eq("fiscal_year_id", ctx.year.id)
    .order("name")
    .order("id");
  if (filter.projectId) projectsQuery.eq("id", filter.projectId);
  if (filter.page !== undefined && !filter.departmentId) {
    const offset = (Math.max(1, filter.page) - 1) * 50;
    projectsQuery.range(offset, offset + 49);
  }
  const projectsResult = wanted("projects")
    ? Promise.resolve(projectsQuery)
    : empty;
  const projectDepartments = async () => {
    // Restrict relationships to this year's displayed projects, not all years.
    const projectRecords = await projectsResult;
    if (projectRecords.error) return projectRecords;
    const ids = filter.projectId
      ? [filter.projectId]
      : projectRecords.data.map((p) => p.id);
    if (!ids.length) return await empty;
    const query = db
      .from("project_departments")
      .select("*")
      .in("project_id", ids);
    return await (finance ? query : query.in("department_id", departmentIds));
  };
  const results = await Promise.all([
    wanted("departments") ? referenceData(ctx.year.id, "departments") : empty,
    wanted("financials") && finance
      ? scope(
          db
            .from("department_financials")
            .select("*")
            .eq("fiscal_year_id", ctx.year.id),
        )
      : empty,
    wanted("requests") ? scope(requestQuery) : empty,
    wanted("requestTypes") ? referenceData(ctx.year.id, "requestTypes") : empty,
    projectsResult,
    wanted("transactions") ? scope(transactionsQuery) : empty,
    wanted("issues") ? scope(issuesQuery) : empty,
    wanted("requirements") ? referenceData(ctx.year.id, "requirements") : empty,
    wanted("years") ? referenceData(ctx.year.id, "years") : empty,
    wanted("projectDepartments") ? projectDepartments() : empty,
  ]);
  for (const r of results)
    if (r.error)
      throw new Error(
        `Finance records could not be loaded (${r.error.code}). Check database setup and permissions.`,
      );
  return {
    ...ctx,
    historyCount: Math.max(
      ...(filter.departmentId || filter.projectId
        ? [2, 5, 6]
        : [2, 4, 5, 6]
      ).map((i) => ("count" in results[i] ? Number(results[i].count ?? 0) : 0)),
    ),
    departments: results[0].data as Department[],
    financials: results[1].data as Financial[],
    requests: results[2].data as FinanceRequest[],
    requestTypes: results[3].data as RequestType[],
    projects: results[4].data as Project[],
    transactions: results[5].data as Transaction[],
    issues: results[6].data as Issue[],
    requirements: results[7].data as Requirement[],
    years: results[8].data,
    projectDepartments: results[9].data as {
      project_id: string;
      department_id: string;
    }[],
  };
}
export function workspace(...args: Parameters<typeof loadWorkspace>) {
  return withTiming("workspace.total", () => loadWorkspace(...args));
}
export type Workspace = Awaited<ReturnType<typeof workspace>>;
