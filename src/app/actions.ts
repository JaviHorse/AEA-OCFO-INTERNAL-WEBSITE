"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { session, requireFinance, yearContext } from "@/lib/auth";
import { serviceClient, serverClient } from "@/lib/supabase/server";
import { archiveRequest, validateSubmissionFolder } from "@/lib/google-drive";
import { extractDriveFolderId } from "@/lib/drive-url";
import {
  notifyEvent,
  sendNewSubmissionNotification,
  sendSubmissionConfirmation,
  sendDiscrepancyAlert,
} from "@/lib/email";
import { cents } from "@/lib/finance";
import type { FinanceRequest } from "@/lib/types";
export type ActionResult = {
  ok: boolean;
  message?: string;
  id?: string;
  data?: unknown;
};
const text = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) =>
      s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""),
    );
const uuid = z.uuid();
const amount = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, "Use at most two decimal places.")
  .refine((s) => cents(s) !== 0n, "Amount cannot be zero.");
const requestSchema = z.object({
  id: uuid.optional(),
  creation_key: uuid.optional(),
  fiscal_year_id: uuid,
  department_id: uuid,
  project_id: z.union([uuid, z.literal("")]),
  request_type_id: uuid,
  title: text(160).pipe(z.string().min(3)),
  amount,
  relevant_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_folder_url: text(500),
  notes: text(),
  submit: z.boolean(),
});
const failure = (e: unknown): ActionResult => ({
  ok: false,
  message:
    e instanceof z.ZodError
      ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : e instanceof Error
        ? e.message
        : "The action could not be completed.",
});
async function rpc(command: string, p: Record<string, unknown>, admin = false) {
  const s = await session();
  const { data, error } = await serviceClient().rpc(
    admin ? "admin_command" : "finance_command",
    { actor: s.user.id, command, p },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data;
}
export async function validateDriveAction(url: string): Promise<ActionResult> {
  try {
    await session();
    return { ok: true, data: await validateSubmissionFolder(url) };
  } catch (e) {
    return failure(e);
  }
}
export async function saveRequest(input: unknown): Promise<ActionResult> {
  try {
    const p = requestSchema.parse(input);
    const s = await yearContext(p.fiscal_year_id);
    if (s.readOnly) throw new Error("This year is read-only.");
    let folderId: string | undefined;
    if (p.source_folder_url)
      folderId = extractDriveFolderId(p.source_folder_url);
    if (p.submit) {
      await validateSubmissionFolder(p.source_folder_url);
      if (p.id) {
        const { data: existing } = await s.db
          .from("requests")
          .select("id")
          .eq("id", p.id)
          .maybeSingle();
        if (!existing) throw new Error("Request is not accessible.");
      }
    }
    const r = (await rpc(p.submit ? "SUBMIT_REQUEST" : "SAVE_REQUEST", {
      ...p,
      source_folder_id: folderId ?? null,
    })) as FinanceRequest;
    if (p.submit) {
      const archived = await archiveRequest(r);
      await Promise.all([
        sendNewSubmissionNotification(r),
        sendSubmissionConfirmation(r),
      ]);
      if (!archived.ok) await sendDiscrepancyAlert(r);
      return {
        ok: true,
        id: r.id,
        message: archived.ok
          ? "Request submitted."
          : "Request submitted; official Drive archival failed. OCFO can retry from the request page.",
      };
    }
    return { ok: true, id: r.id };
  } catch (e) {
    return failure(e);
  }
}
export async function requestAction(
  command: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const allowed = [
      "TRANSITION",
      "REVIEW",
      "COMMENT",
      "VERIFY_DOCUMENT",
      "FLAG_ISSUE",
    ];
    if (!allowed.includes(command)) throw new Error("Invalid action.");
    const id = uuid.parse(input.id);
    const s = await session();
    const { data: r } = await s.db
      .from("requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!r) throw new Error("Request not accessible.");
    const p: Record<string, unknown> = {
      ...input,
      id,
      notes: text().parse(input.notes ?? ""),
    };
    if (command === "TRANSITION")
      p.status = z
        .enum([
          "UNDER_OCFO_REVIEW",
          "READY_FOR_CFO",
          "APPROVED",
          "PROCESSING",
          "COMPLETED",
          "REJECTED",
          "NEEDS_REVISION",
          "CANCELLED",
        ])
        .parse(input.status);
    if (command === "REVIEW") {
      p.review_status = z
        .enum(["PENDING_REVIEW", "REVIEWED", "HAS_COMMENTS"])
        .parse(input.review_status);
      p.recommendation = z
        .enum(["APPROVE", "REVISION", "NONE"])
        .parse(input.recommendation);
    }
    if (command === "COMMENT")
      p.visibility = z
        .enum(["INTERNAL_OCFO", "REQUESTER_VISIBLE"])
        .parse(input.visibility);
    if (command === "VERIFY_DOCUMENT") {
      p.requirement_id = uuid.parse(input.requirement_id);
      p.is_verified = z.boolean().parse(input.is_verified);
    }
    if (command === "FLAG_ISSUE") {
      p.code = z
        .string()
        .regex(/^[A-Z0-9_]{3,80}$/)
        .parse(input.code);
      p.severity = z
        .enum(["CRITICAL", "HIGH", "WARNING"])
        .parse(input.severity);
      if (!p.notes) throw new Error("Describe the issue.");
    }
    const result = await rpc(command, p);
    if (command === "TRANSITION") {
      const changed = result as FinanceRequest;
      await notifyEvent(String(p.status), changed);
      if (p.status === "APPROVED" && changed.status === "COMPLETED")
        await notifyEvent("COMPLETED", changed);
      if (p.status === "APPROVED") {
        const { count } = await serviceClient()
          .from("discrepancies")
          .select("*", { count: "exact", head: true })
          .eq("entity_id", id)
          .eq("severity", "CRITICAL")
          .eq("status", "OPEN");
        if (count) await sendDiscrepancyAlert(changed);
      }
    }
    if (command === "VERIFY_DOCUMENT" && !p.is_verified)
      await notifyEvent("MISSING_REQUIRED_DOCUMENT", r);
    if (command === "FLAG_ISSUE" && p.severity === "CRITICAL")
      await sendDiscrepancyAlert(r);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function recordTransaction(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const schema = z.object({
      fiscal_year_id: uuid,
      department_id: uuid,
      project_id: z.union([uuid, z.literal("")]),
      request_id: z.union([uuid, z.literal("")]),
      type: z.enum(["EXPENSE", "REVENUE"]),
      amount: amount.refine((s) => cents(s) > 0n),
      transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      description: text(1000).pipe(z.string().min(3)),
      idempotency_key: uuid,
    });
    const p = schema.parse(input);
    await requireFinance(p.fiscal_year_id);
    await rpc("TRANSACTION", p);
    if (p.request_id) {
      const { data: r } = await serviceClient()
        .from("requests")
        .select("*")
        .eq("id", p.request_id)
        .single();
      const { count } = await serviceClient()
        .from("discrepancies")
        .select("*", { head: true, count: "exact" })
        .eq("entity_id", p.request_id)
        .eq("severity", "CRITICAL")
        .eq("status", "OPEN");
      if (count && r) await sendDiscrepancyAlert(r);
    }
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function retryArchive(id: string): Promise<ActionResult> {
  try {
    uuid.parse(id);
    const s = await session();
    const { data: r } = await s.db
      .from("requests")
      .select("*")
      .eq("id", id)
      .single();
    if (!r) throw new Error("Request not found.");
    await requireFinance(r.fiscal_year_id);
    if (
      ![
        "SUBMITTED",
        "UNDER_OCFO_REVIEW",
        "NEEDS_REVISION",
        "READY_FOR_CFO",
      ].includes(r.status)
    )
      throw new Error("Archival retries are allowed only before approval.");
    const { data: locked, error } = await serviceClient()
      .from("requests")
      .update({
        drive_copy_status: "COPYING",
        drive_copy_started_at: new Date().toISOString(),
      })
      .eq("id", id)
      .or(
        `drive_copy_status.in.(FAILED,PENDING),and(drive_copy_status.eq.COPYING,drive_copy_started_at.lt.${new Date(Date.now() - 300000).toISOString()})`,
      )
      .select("id")
      .maybeSingle();
    if (error || !locked)
      throw new Error("Archive is already running or complete.");
    const result = await archiveRequest(r);
    revalidatePath("/", "layout");
    return { ok: result.ok, message: result.message };
  } catch (e) {
    return failure(e);
  }
}
export async function adminAction(
  command: string,
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const s = await requireFinance(undefined, true);
    const p = { ...input };
    const allowed = [
      "CREATE_YEAR",
      "ACTIVATE_YEAR",
      "CLOSE_YEAR",
      "MEMBERSHIP",
      "PROJECT",
      "PROJECT_MEMBER",
      "DEPARTMENT",
      "SETTING",
      "REQUEST_TYPE",
      "REQUIREMENT",
    ];
    if (!allowed.includes(command)) throw new Error("Invalid admin command.");
    if (command === "MEMBERSHIP") {
      p.email = z.email().parse(input.email).toLowerCase();
      p.role = z
        .enum([
          "CFO_ADMIN",
          "OCFO_MEMBER",
          "DEPARTMENT_MEMBER",
          "PROJECT_MEMBER",
        ])
        .parse(input.role);
      p.department_id = uuid.parse(input.department_id);
      p.fiscal_year_id = uuid.parse(input.fiscal_year_id);
      p.is_active = z.boolean().parse(input.is_active);
    }
    if (command === "SETTING") {
      const key = z
        .enum([
          "finance_notification_email",
          "notification_recipients",
          "resend_from_email",
          "report_due_days",
          "reminder_days",
          "unprocessed_warning_days",
          "long_open_warning_days",
          "ocfo_can_record_transactions",
          "allow_unlinked_transactions",
          "google_drive_root_folder_id",
          "workflow_overrides",
        ])
        .parse(input.key);
      p.key = key;
      if (["finance_notification_email", "resend_from_email"].includes(key))
        p.value = z.email().parse(input.value);
      else if (key === "notification_recipients")
        p.value = z.array(z.email()).parse(input.value);
      else if (key.endsWith("_days"))
        p.value = z.number().int().min(0).max(365).parse(input.value);
      else if (
        [
          "ocfo_can_record_transactions",
          "allow_unlinked_transactions",
        ].includes(key)
      )
        p.value = z.boolean().parse(input.value);
      else if (key === "google_drive_root_folder_id")
        p.value = z
          .string()
          .regex(/^[\w-]{10,}$/)
          .parse(input.value);
      else p.value = z.record(z.string(), z.unknown()).parse(input.value);
    }
    if (command === "CREATE_YEAR") {
      p.code = z
        .string()
        .regex(/^\d{4}$/)
        .parse(input.code);
      p.label = text(80).pipe(z.string().min(3)).parse(input.label);
      p.start_date = z.iso.date().parse(input.start_date);
      p.end_date = z.iso.date().parse(input.end_date);
    }
    if (command === "DEPARTMENT") {
      p.code = z
        .string()
        .regex(/^[A-Za-z0-9]{2,12}$/)
        .parse(input.code);
      p.name = text(120).pipe(z.string().min(3)).parse(input.name);
    }
    if (command === "PROJECT") {
      p.name = text(160).pipe(z.string().min(3)).parse(input.name);
      p.description = text(4000).parse(input.description ?? "");
      p.department_ids = z.array(uuid).min(1).parse(input.department_ids);
      p.status = z
        .enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"])
        .parse(input.status);
    }
    if (command === "REQUIREMENT") {
      p.request_type_id = uuid.parse(input.request_type_id);
      p.document_code = z
        .string()
        .regex(/^[A-Z0-9_]{2,40}$/)
        .parse(input.document_code);
      p.label = text(300).pipe(z.string().min(2)).parse(input.label);
      if (input.template_url)
        p.template_url = z
          .url()
          .refine((u) => new URL(u).protocol === "https:")
          .parse(input.template_url);
      if (input.condition_type && input.condition_type !== "AMOUNT_LT")
        throw new Error("Unsupported requirement condition.");
    }
    await rpc(command, p, true);
    revalidatePath("/admin");
    return { ok: true, message: "Saved." };
  } catch (e) {
    return failure(e);
  }
}
export async function saveGuide(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const s = await requireFinance();
    const schema = z.object({
      id: uuid.optional(),
      title: text(160).pipe(z.string().min(3)),
      slug: z.string().regex(/^[a-z0-9-]+$/),
      content: text(16000).pipe(z.string().min(3)),
      is_published: z.boolean(),
      display_order: z.number().int(),
    });
    const p = schema.parse(input);
    const db = serviceClient();
    if (p.id) {
      const { data: old } = await db
        .from("faq_guides")
        .select("*")
        .eq("id", p.id)
        .single();
      if (old?.fiscal_year_id) {
        await requireFinance(old.fiscal_year_id);
      }
    }
    const { data, error } = await db
      .from("faq_guides")
      .upsert({ ...p, updated_by: s.user.id })
      .select("id")
      .single();
    if (error) throw new Error("Guide could not be saved.");
    await db.from("audit_logs").insert({
      actor_user_id: s.user.id,
      action: "UPDATE_GUIDE",
      entity_type: "faq_guides",
      entity_id: data.id,
      fiscal_year_id: s.activeYear.id,
      new_data: p,
    });
    revalidatePath("/guide");
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function resolveIssue(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    await rpc("RESOLVE_ISSUE", {
      id: uuid.parse(input.id),
      status: z.enum(["RESOLVED", "DISMISSED"]).parse(input.status),
      notes: text().pipe(z.string().min(3)).parse(input.notes),
    });
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function submitReport(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const p = z
      .object({
        fiscal_year_id: uuid,
        department_id: uuid,
        project_id: uuid,
        request_id: uuid,
        total_expenses: amount.or(z.literal("0")),
        total_revenue: amount.or(z.literal("0")),
        variance: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/),
      })
      .parse(input);
    if (cents(p.total_expenses) < 0n || cents(p.total_revenue) < 0n)
      throw new Error("Totals cannot be negative.");
    await rpc("PROJECT_REPORT", p);
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
export async function signOut() {
  const db = await serverClient();
  await db.auth.signOut();
  redirect("/login");
}
export async function verifyRecord(
  kind: "transaction" | "report",
  id: string,
): Promise<ActionResult> {
  try {
    uuid.parse(id);
    await rpc(
      kind === "transaction" ? "VERIFY_TRANSACTION" : "VERIFY_PROJECT_REPORT",
      { id },
    );
    return { ok: true };
  } catch (e) {
    return failure(e);
  }
}
