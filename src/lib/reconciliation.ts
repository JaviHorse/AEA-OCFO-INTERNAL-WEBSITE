import "server-only";
import { withTiming } from "./performance";
import { serviceClient } from "./supabase/server";
import { cents } from "./finance";
import { notifyEvent } from "./email";
import { listFolderFiles } from "./google-drive";
import type { FinanceRequest } from "./types";
import { queryPages } from "./query-pages";
type Candidate = {
  fiscal_year_id: string;
  department_id: string;
  code: string;
  severity: "CRITICAL" | "HIGH" | "WARNING";
  entity_type: string;
  entity_id: string;
  description: string;
};
async function runReconciliation(yearId: string) {
  const db = serviceClient();
  const results = await Promise.all([
    db.from("department_financials").select("*").eq("fiscal_year_id", yearId),
    db.from("organization_settings").select("*"),
    db.from("request_types").select("id,creates_commitment"),
  ]);
  for (const result of results)
    if (result.error)
      throw new Error("Reconciliation data could not be loaded.");
  const [financials, settings, requestTypes] = results.map((r) => r.data ?? []);
  const financialByDepartment = new Map(
    financials.map((f) => [f.department_id, f]),
  );
  const reservingTypes = new Set(
    requestTypes.filter((t) => t.creates_commitment).map((t) => t.id),
  );
  let checked = 0;
  let issues = 0;
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
  const sources = await db
    .from("requests")
    .select("*")
    .eq("fiscal_year_id", yearId)
    .not("source_folder_id", "is", null)
    .neq("status", "DRAFT")
    .order("drive_checked_at", { ascending: true, nullsFirst: true })
    .order("id")
    .limit(2);
  if (sources.error) throw new Error("Source checks could not be loaded.");
  const checkSources = sources.data ?? [];
  for (const r of checkSources) {
    try {
      const files = await listFolderFiles(r.source_folder_id, undefined, 1);
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
    const update = await db
      .from("requests")
      .update({ drive_checked_at: new Date().toISOString() })
      .eq("id", r.id);
    if (update.error)
      throw new Error("Source check timestamp could not be saved.");
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
  await persistCandidates();
  for await (const requests of queryPages(
    (from, to) =>
      db
        .from("requests")
        .select("*")
        .eq("fiscal_year_id", yearId)
        .order("id")
        .range(from, to),
    "Request reconciliation could not be loaded.",
    100,
  )) {
    checked += requests.length;
    const ids = requests.map((r) => r.id);
    const commitments = new Set<string>();
    for await (const batch of queryPages(
      (from, to) =>
        db
          .from("commitments")
          .select("request_id,remaining_amount")
          .eq("fiscal_year_id", yearId)
          .eq("status", "ACTIVE")
          .in("request_id", ids)
          .order("id")
          .range(from, to),
      "Commitments could not be loaded.",
    )) {
      for (const c of batch)
        if (cents(String(c.remaining_amount)) > 0n)
          commitments.add(c.request_id);
    }
    const actualByRequest = new Map<string, bigint>();
    const byId = new Map(requests.map((r) => [r.id, r]));
    for await (const transactions of queryPages(
      (from, to) =>
        db
          .from("transactions")
          .select("id,request_id,department_id,type,amount")
          .eq("fiscal_year_id", yearId)
          .in("request_id", ids)
          .order("id")
          .range(from, to),
      "Transactions could not be loaded.",
    )) {
      for (const t of transactions) {
        if (t.type === "EXPENSE")
          actualByRequest.set(
            t.request_id,
            (actualByRequest.get(t.request_id) ?? 0n) + cents(String(t.amount)),
          );
        const r = byId.get(t.request_id);
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
      }
      await persistCandidates(requests as FinanceRequest[]);
    }
    for (const r of requests) {
      const f = financialByDepartment.get(r.department_id);
      if (
        ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(
          r.status,
        ) &&
        reservingTypes.has(r.request_type_id) &&
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
      const active = commitments.has(r.id);
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
      const actual = actualByRequest.get(r.id) ?? 0n;
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
    await persistCandidates(requests as FinanceRequest[]);
  }
  if (!config.allow_unlinked_transactions) {
    for await (const transactions of queryPages(
      (from, to) =>
        db
          .from("transactions")
          .select("id,department_id")
          .eq("fiscal_year_id", yearId)
          .is("request_id", null)
          .order("id")
          .range(from, to),
      "Unlinked transactions could not be loaded.",
    )) {
      for (const t of transactions)
        flag(
          yearId,
          t.department_id,
          "transactions",
          t.id,
          "UNLINKED_TRANSACTION",
          "WARNING",
          "Transaction has no expected request link.",
        );
      await persistCandidates();
    }
  }
  for await (const projects of queryPages(
    (from, to) =>
      db
        .from("projects")
        .select("id,end_date")
        .eq("fiscal_year_id", yearId)
        .order("id")
        .range(from, to),
    "Projects could not be loaded.",
    100,
  )) {
    for (const project of projects) {
      if (!project.end_date) continue;
      const [departments, reportResult] = await Promise.all([
        db
          .from("project_departments")
          .select("project_id,department_id")
          .eq("project_id", project.id),
        db
          .from("project_reports")
          .select("project_id,department_id")
          .eq("project_id", project.id)
          .eq("fiscal_year_id", yearId),
      ]);
      if (departments.error || reportResult.error)
        throw new Error("Project reporting context could not be loaded.");
      const projectDepts = departments.data ?? [];
      const reports = reportResult.data ?? [];
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
          const lookup = await db
            .from("requests")
            .select("*")
            .eq("fiscal_year_id", yearId)
            .eq("project_id", project.id)
            .eq("department_id", pd.department_id)
            .neq("status", "DRAFT")
            .order("id")
            .limit(1);
          if (lookup.error)
            throw new Error("Project representative could not be loaded.");
          const representative = lookup.data?.[0];
          if (representative) {
            const event =
              age > due ? "PROJECT_END_OVERDUE" : "PROJECT_END_DUE_SOON";
            const { count, error: notificationError } = await db
              .from("notifications")
              .select("*", { head: true, count: "exact" })
              .eq("request_id", representative.id)
              .eq("event_type", event)
              .gte("created_at", new Date(Date.now() - 86400000).toISOString());
            if (notificationError)
              throw new Error("Reminder history could not be loaded.");
            if (!count)
              await notifyEvent(event, representative as FinanceRequest);
          }
        }
      }
    }
    await persistCandidates();
  }
  return { checked, issues };

  async function persistCandidates(requests: FinanceRequest[] = []) {
    issues += candidates.length;
    for (const candidate of candidates) {
      const { data: existing, error: lookupError } = await db
        .from("discrepancies")
        .select("id")
        .eq("fiscal_year_id", yearId)
        .eq("code", candidate.code)
        .eq("entity_type", candidate.entity_type)
        .eq("entity_id", candidate.entity_id)
        .eq("status", "OPEN")
        .maybeSingle();
      if (lookupError) throw new Error("Reconciliation issue lookup failed.");
      if (existing) continue;
      const { error } = await db.from("discrepancies").insert(candidate);
      if (error?.code === "23505") continue; // Another cron run already recorded it.
      if (error) throw new Error("Unable to record reconciliation issue.");
      if (candidate.severity === "CRITICAL") {
        let r =
          requests.find((r) => r.id === candidate.entity_id) ??
          requests.find((r) => r.department_id === candidate.department_id);
        if (!r) {
          const representative = await db
            .from("requests")
            .select("*")
            .eq("fiscal_year_id", yearId)
            .eq("department_id", candidate.department_id)
            .order("id")
            .limit(1);
          if (representative.error)
            throw new Error("Discrepancy recipient could not be loaded.");
          r = representative.data?.[0] as FinanceRequest | undefined;
        }
        if (r) await notifyEvent("CRITICAL_DISCREPANCY", r);
      }
    }
    candidates.length = 0;
  }
}

export function reconcileYear(yearId: string) {
  return withTiming("reconciliation.total", () => runReconciliation(yearId));
}
