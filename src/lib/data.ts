import "server-only";
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
export async function workspace(
  yearId?: string,
  datasets?: Dataset[],
  filter: {
    departmentId?: string;
    requestId?: string;
    projectId?: string;
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
    .select("*")
    .eq("fiscal_year_id", ctx.year.id)
    .order("created_at", { ascending: false });
  const transactionsQuery = db
    .from("transactions")
    .select("*")
    .eq("fiscal_year_id", ctx.year.id)
    .order("transaction_date", { ascending: false });
  const issuesQuery = db
    .from("discrepancies")
    .select("*")
    .eq("fiscal_year_id", ctx.year.id)
    .order("detected_at", { ascending: false });
  if (filter.projectId) {
    requestQuery.eq("project_id", filter.projectId);
    transactionsQuery.eq("project_id", filter.projectId);
  }
  if (filter.requestId) {
    transactionsQuery.eq("request_id", filter.requestId);
    issuesQuery.eq("entity_id", filter.requestId);
  }
  const results = await Promise.all([
    wanted("departments") ? referenceData(ctx.year.id, "departments") : empty,
    wanted("financials")
      ? scope(
          db
            .from("department_financials")
            .select("*")
            .eq("fiscal_year_id", ctx.year.id),
        )
      : empty,
    wanted("requests") ? scope(requestQuery) : empty,
    wanted("requestTypes") ? referenceData(ctx.year.id, "requestTypes") : empty,
    wanted("projects")
      ? db
          .from("projects")
          .select("*")
          .eq("fiscal_year_id", ctx.year.id)
          .order("name")
      : empty,
    wanted("transactions") ? scope(transactionsQuery) : empty,
    wanted("issues") ? scope(issuesQuery) : empty,
    wanted("requirements") ? referenceData(ctx.year.id, "requirements") : empty,
    wanted("years") ? referenceData(ctx.year.id, "years") : empty,
    wanted("projectDepartments")
      ? finance
        ? db.from("project_departments").select("*")
        : db
            .from("project_departments")
            .select("*")
            .in("department_id", departmentIds)
      : empty,
  ]);
  for (const r of results)
    if (r.error)
      throw new Error(
        `Finance records could not be loaded (${r.error.code}). Check database setup and permissions.`,
      );
  return {
    ...ctx,
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
export type Workspace = Awaited<ReturnType<typeof workspace>>;
