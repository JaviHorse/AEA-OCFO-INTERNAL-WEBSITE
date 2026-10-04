import "server-only";
import { Resend } from "resend";
import { env } from "./env";
import { serviceClient } from "./supabase/server";
import { money, human } from "./finance";
import { notificationText } from "./ux";
import type { FinanceRequest } from "./types";
import { resendConfiguration } from "./resend-config";
import {
  isGmailDecision,
  sendDecisionNotification,
} from "./gmail-notifications";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function notify(
  event: string,
  r: FinanceRequest,
  recipient: string,
) {
  const configuration = resendConfiguration();
  if (!configuration) return { ok: true, disabled: true };
  const db = serviceClient();
  const { data: record, error: insertError } = await db
    .from("notifications")
    .insert({
      event_type: event,
      recipient,
      request_id: r.id,
      fiscal_year_id: r.fiscal_year_id,
      department_id: r.department_id,
    })
    .select("id")
    .single();
  if (insertError)
    throw new Error("Unable to record notification delivery history.");
  try {
    const { data: setting } = await db
      .from("organization_settings")
      .select("value")
      .eq("key", "resend_from_email")
      .maybeSingle();
    const sender =
      (typeof setting?.value === "string" && setting.value.trim()) ||
      configuration.sender;
    const [
      { data: dept },
      { data: type },
      { data: requester },
      { data: project },
    ] = await Promise.all([
      db.from("departments").select("name").eq("id", r.department_id).single(),
      db
        .from("request_types")
        .select("name")
        .eq("id", r.request_type_id)
        .single(),
      db
        .from("users")
        .select("email,full_name")
        .eq("id", r.requester_user_id)
        .single(),
      r.project_id
        ? db.from("projects").select("name").eq("id", r.project_id).single()
        : Promise.resolve({ data: null }),
    ]);
    const info = [
      ["Reference", r.reference_code ?? "Draft"],
      ["Department", dept?.name ?? ""],
      ["Requester", requester?.full_name ?? requester?.email ?? ""],
      ["Type", type?.name ?? ""],
      ["Amount", money(r.amount)],
      ["Project", project?.name ?? "Non-project"],
      ["Status", human(r.status)],
    ];
    const result = await new Resend(configuration.apiKey).emails.send(
      {
        from: sender,
        to: recipient,
        subject: `${r.reference_code ?? "AEA Finance"}: ${notificationText(event)}`,
        html: `<h2>${escape(notificationText(event))}</h2><p>${escape(r.title)}</p>${info.map(([k, v]) => `<p><strong>${k}</strong>: ${escape(v)}</p>`).join("")}<p><a href="${escape(env().NEXT_PUBLIC_APP_URL)}/requests/${r.id}">Open your request for details and next steps</a></p>${r.source_folder_url ? `<p><a href="${escape(r.source_folder_url)}">Submission folder</a></p>` : ""}`,
      },
      { idempotencyKey: record.id },
    );
    if (result.error)
      throw new Error(
        "Resend rejected delivery. Check sender verification and recipient restrictions.",
      );
    await db
      .from("notifications")
      .update({
        delivery_status: "SENT",
        sent_at: new Date().toISOString(),
        provider_message_id: result.data?.id,
      })
      .eq("id", record.id);
  } catch (error) {
    await db
      .from("notifications")
      .update({
        delivery_status: "FAILED",
        error:
          error instanceof Error ? error.message : "Email delivery failed.",
      })
      .eq("id", record.id);
  }
}
export async function financeRecipients(yearId: string) {
  const db = serviceClient();
  const [{ data: setting }, { data: members }, { data: extra }] =
    await Promise.all([
      db
        .from("organization_settings")
        .select("value")
        .eq("key", "finance_notification_email")
        .maybeSingle(),
      db
        .from("memberships")
        .select("email")
        .eq("fiscal_year_id", yearId)
        .eq("role", "CFO_ADMIN")
        .eq("is_active", true),
      db
        .from("organization_settings")
        .select("value")
        .eq("key", "notification_recipients")
        .maybeSingle(),
    ]);
  return [
    ...new Set([
      setting?.value ?? env().FINANCE_NOTIFICATION_EMAIL,
      ...(members ?? []).map((m) => m.email),
      ...(Array.isArray(extra?.value) ? extra.value : []),
    ]),
  ].filter((x) => typeof x === "string") as string[];
}
export async function notifyEvent(event: string, r: FinanceRequest) {
  if (isGmailDecision(event)) return sendDecisionNotification(event, r);
  // Disabled delivery is intentional, not a failed/queued notification. Avoid
  // recipient queries and repeated FAILED rows during scheduled reminders.
  if (!resendConfiguration()) return { ok: true, disabled: true };
  const db = serviceClient();
  const { data: user } = await db
    .from("users")
    .select("email")
    .eq("id", r.requester_user_id)
    .single();
  const recipients: string[] = [
    "NEW_SUBMISSION",
    "READY_FOR_CFO",
    "CRITICAL_DISCREPANCY",
  ].includes(event)
    ? await financeRecipients(r.fiscal_year_id)
    : ([user?.email].filter(Boolean) as string[]);
  if (event === "PROJECT_END_OVERDUE")
    recipients.push(...(await financeRecipients(r.fiscal_year_id)));
  if (!recipients.length)
    throw new Error("No notification recipient is configured.");
  const unique = [...new Set(recipients)];
  for (let offset = 0; offset < unique.length; offset += 5)
    await Promise.all(
      unique.slice(offset, offset + 5).map((email) => notify(event, r, email)),
    );
}
export const sendNewSubmissionNotification = (r: FinanceRequest) =>
  notifyEvent("NEW_SUBMISSION", r);
export const sendSubmissionConfirmation = (r: FinanceRequest) =>
  notifyEvent("SUBMISSION_CONFIRMATION", r);
export const sendNeedsRevisionEmail = (r: FinanceRequest) =>
  notifyEvent("NEEDS_REVISION", r);
export const sendReadyForCfoEmail = (r: FinanceRequest) =>
  notifyEvent("READY_FOR_CFO", r);
export const sendApprovedEmail = (r: FinanceRequest) =>
  notifyEvent("APPROVED", r);
export const sendRejectedEmail = (r: FinanceRequest) =>
  notifyEvent("REJECTED", r);
export const sendCompletedEmail = (r: FinanceRequest) =>
  notifyEvent("COMPLETED", r);
export const sendDiscrepancyAlert = (r: FinanceRequest) =>
  notifyEvent("CRITICAL_DISCREPANCY", r);
