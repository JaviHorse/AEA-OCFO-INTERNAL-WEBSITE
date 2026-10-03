import "server-only";
import { yearContext } from "./auth";
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
export async function workspace(yearId?: string) {
  const ctx = await yearContext(yearId);
  const db = ctx.db;
  const results = await Promise.all([
    db.from("departments").select("*").order("code"),
    db
      .from("department_financials")
      .select("*")
      .eq("fiscal_year_id", ctx.year.id),
    db
      .from("requests")
      .select("*")
      .eq("fiscal_year_id", ctx.year.id)
      .order("created_at", { ascending: false }),
    db.from("request_types").select("*").order("name"),
    db
      .from("projects")
      .select("*")
      .eq("fiscal_year_id", ctx.year.id)
      .order("name"),
    db
      .from("transactions")
      .select("*")
      .eq("fiscal_year_id", ctx.year.id)
      .order("transaction_date", { ascending: false }),
    db
      .from("discrepancies")
      .select("*")
      .eq("fiscal_year_id", ctx.year.id)
      .order("detected_at", { ascending: false }),
    db.from("document_requirements").select("*").order("display_order"),
    db
      .from("fiscal_years")
      .select("*")
      .order("start_date", { ascending: false }),
    db.from("project_departments").select("*"),
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
