import "server-only";
import { serviceClient } from "./supabase/server";
import { cents } from "./finance";
import { notifyEvent } from "./email";
import { listFolderFiles } from "./google-drive";
import type { FinanceRequest } from "./types";
type Candidate = {
  fiscal_year_id: string;
  department_id: string;
  code: string;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  entity_type: string;
  entity_id: string;
  description: string;
};
export async function reconcileYear(yearId: string) {
  const db = serviceClient();
  const results = await Promise.all([
    db.from("department_financials").select("*").eq("fiscal_year_id", yearId),
    db.from("requests").select("*").eq("fiscal_year_id", yearId),
    db.from("commitments").select("*").eq("fiscal_year_id", yearId),
    db.from("transactions").select("*").eq("fiscal_year_id", yearId),
    db.from("projects").select("*").eq("fiscal_year_id", yearId),
    db.from("project_reports").select("*").eq("fiscal_year_id", yearId),
    db.from("organization_settings").select("*"),
    db.from("project_departments").select("*"),
  ]);
  for (const result of results)
    if (result.error)
      throw new Error("Reconciliation data could not be loaded.");
  const [
    financials,
    requests,
    commitments,
    transactions,
    projects,
    reports,
    settings,
    projectDepts,
  ] = results.map((r) => r.data ?? []);
  const config = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const days = (date: string) =>
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  const candidates: Candidate[] = [];
  const flag = (
    year: string,
    department: string,
    entity: string,
    id: string,
    code: string,
    severity: Candidate["severity"],
    description: string,
  ) =>
    candidates.push({
      fiscal_year_id: year,
      department_id: department,
      entity_type: entity,
      entity_id: id,
      code,
      severity,
      description,
    });
  // Rotate through oldest checked sources to stay within free-tier execution limits.
  const checkSources = requests
    .filter((r) => r.source_folder_id && r.status !== "DRAFT")
    .sort((a, b) =>
      String(a.drive_checked_at ?? "").localeCompare(
        String(b.drive_checked_at ?? ""),
      ),
    )
    .slice(0, 5);
  for (const r of checkSources) {
    try {
      const files = await listFolderFiles(r.source_folder_id);
      if (!files.length)
        flag(
          yearId,
          r.department_id,
          "requests",
          r.id,
          "SOURCE_FOLDER_EMPTY",
          "WARNING",
          "The submitted source folder is now empty.",
        );
    } catch {
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "SOURCE_INACCESSIBLE",
        "WARNING",
        "The source folder or supporting file is no longer accessible to the finance integration.",
      );
    }
    await db
      .from("requests")
      .update({ drive_checked_at: new Date().toISOString() })
      .eq("id", r.id);
  }
  for (const f of financials) {
    if (cents(String(f.available_funds)) < 0n)
      flag(
        yearId,
        f.department_id,
        "department_budgets",
        f.id,
        "NEGATIVE_AVAILABLE_FUNDS",
        "CRITICAL",
        "Available funds are negative.",
      );
    if (cents(String(f.actual_expenses)) > cents(String(f.current_budget)))
      flag(
        yearId,
        f.department_id,
        "department_budgets",
        f.id,
        "APPROVED_BUDGET_EXCEEDED",
        "CRITICAL",
        "Actual expenses exceed the current approved budget.",
      );
  }
  for (const r of requests) {
    const f = financials.find((f) => f.department_id === r.department_id);
    if (
      ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(r.status) &&
      f &&
      cents(String(r.amount)) > cents(String(f.available_funds))
    )
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "REQUEST_EXCEEDS_AVAILABLE",
        "HIGH",
        "Request amount exceeds available department funds.",
      );
    if (
      ["APPROVED", "PROCESSING"].includes(r.status) &&
      days(r.approved_at) > Number(config.unprocessed_warning_days ?? 14)
    )
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "APPROVED_UNPROCESSED",
        "WARNING",
        "Approved request has remained open beyond the configured processing threshold.",
      );
    if (
      !["DRAFT", "COMPLETED", "REJECTED", "CANCELLED"].includes(r.status) &&
      days(r.submitted_at) > Number(config.long_open_warning_days ?? 30)
    )
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "LONG_OPEN_REQUEST",
        "WARNING",
        "Request has remained open beyond the configured threshold.",
      );
    const active = commitments.find(
      (c) =>
        c.request_id === r.id &&
        c.status === "ACTIVE" &&
        cents(String(c.remaining_amount)) > 0n,
    );
    if (active && ["COMPLETED", "REJECTED", "CANCELLED"].includes(r.status))
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "TERMINAL_ACTIVE_COMMITMENT",
        "CRITICAL",
        "A terminal request still has an active commitment.",
      );
    const actual = transactions
      .filter((t) => t.request_id === r.id && t.type === "EXPENSE")
      .reduce((n, t) => n + cents(String(t.amount)), 0n);
    if (actual > cents(String(r.amount)) && actual > 0n)
      flag(
        yearId,
        r.department_id,
        "requests",
        r.id,
        "ACTUAL_EXCEEDS_APPROVED",
        "CRITICAL",
        "Actual expenses exceed the approved amount.",
      );
  }
  for (const t of transactions) {
    const r = requests.find((r) => r.id === t.request_id);
    if (r && t.department_id !== r.department_id)
      flag(
        yearId,
        t.department_id,
        "transactions",
        t.id,
        "WRONG_DEPARTMENT",
        "CRITICAL",
        "Transaction department differs from the linked request.",
      );
    if (!t.request_id && !config.allow_unlinked_transactions)
      flag(
        yearId,
        t.department_id,
        "transactions",
        t.id,
        "UNLINKED_TRANSACTION",
        "WARNING",
        "Transaction has no expected request link.",
      );
  }
  for (const project of projects) {
    if (!project.end_date) continue;
    const age = days(project.end_date),
      due = Number(config.report_due_days ?? 7),
      reminder = Number(config.reminder_days ?? 3);
    for (const pd of projectDepts.filter(
      (pd) => pd.project_id === project.id,
    )) {
      if (
        reports.some(
          (report) =>
            report.project_id === project.id &&
            report.department_id === pd.department_id,
        )
      )
        continue;
      if (age > due) {
        flag(
          yearId,
          pd.department_id,
          "projects",
          project.id,
          "PROJECT_END_OVERDUE",
          "WARNING",
          "Project-end report is overdue.",
        );
      }
      if (age >= due - reminder) {
        const representative = requests.find(
          (r) =>
            r.project_id === project.id && r.department_id === pd.department_id,
        );
        if (representative) {
          const event =
            age > due ? "PROJECT_END_OVERDUE" : "PROJECT_END_DUE_SOON";
          const { count } = await db
            .from("notifications")
            .select("*", { head: true, count: "exact" })
            .eq("request_id", representative.id)
            .eq("event_type", event)
            .gte("created_at", new Date(Date.now() - 86400000).toISOString());
          if (!count)
            await notifyEvent(event, representative as FinanceRequest);
        }
      }
    }
  }
  for (const candidate of candidates) {
    const { data: existing } = await db
      .from("discrepancies")
      .select("id")
      .eq("fiscal_year_id", yearId)
      .eq("code", candidate.code)
      .eq("entity_type", candidate.entity_type)
      .eq("entity_id", candidate.entity_id)
      .eq("status", "OPEN")
      .maybeSingle();
    if (existing) continue;
    const { error } = await db.from("discrepancies").insert(candidate);
    if (error) throw new Error("Unable to record reconciliation issue.");
    if (candidate.severity === "CRITICAL") {
      const r =
        requests.find((r) => r.id === candidate.entity_id) ??
        requests.find((r) => r.department_id === candidate.department_id);
      if (r) await notifyEvent("CRITICAL_DISCREPANCY", r as FinanceRequest);
    }
  }
  return { checked: requests.length, issues: candidates.length };
}
