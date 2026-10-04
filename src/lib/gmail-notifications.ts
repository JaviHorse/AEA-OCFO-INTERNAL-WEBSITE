import "server-only";
import { z } from "zod";
import { serviceClient } from "./supabase/server";
import { sendGmail } from "./gmail";
import { money } from "./finance";
import type { FinanceRequest } from "./types";

const events: Record<string, { name: string; status: string; subject: string; body: string }> = {
  APPROVED: { name: "REQUEST_APPROVED", status: "Approved", subject: "Approved", body: "Your finance request has been approved." },
  REJECTED: { name: "REQUEST_REJECTED", status: "Rejected", subject: "Update on", body: "Your finance request was not approved. Log in to view the decision and requester-visible feedback." },
  NEEDS_REVISION: { name: "REQUEST_NEEDS_REVISION", status: "Incomplete", subject: "Action Required for", body: "Finance has requested changes to your request. Log in to review the changes and resubmit." },
};
export const isGmailDecision = (event: string) => Object.hasOwn(events, event);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function decisionEmail(event: string, request: FinanceRequest, name: string, appUrl: string) {
  const info = events[event];
  if (!info) throw new Error("Unsupported Gmail notification.");
  const base = new URL(appUrl);
  if (!["https:", "http:"].includes(base.protocol)) throw new Error("Invalid application URL.");
  const link = new URL(`/requests/${request.id}`, base).href;
  const reference = request.reference_code ?? "AEA Finance";
  const lines = [`Hello ${name || "there"},`, info.body, `Reference: ${reference}`, `Request: ${request.title}`, `Amount: ${money(request.amount)}`, `Status: ${info.status}`, `View your request: ${link}`, "AEA Office of the Chief Financial Officer"];
  return { subject: event === "APPROVED" ? `[AEA Finance] ${reference} Approved` : `[AEA Finance] ${info.subject} ${reference}`,
    text: lines.join("\n\n"), html: lines.map(line => `<p>${escape(line)}</p>`).join("") };
}
export async function sendDecisionNotification(event: string, request: FinanceRequest): Promise<{ ok: boolean; message?: string }> {
  const warning = `Request ${events[event]?.status.toLowerCase() ?? "updated"}. Email notification could not be sent; check notification delivery history.`;
  try {
    const db = serviceClient();
    const user = await db.from("users").select("email,full_name").eq("id", request.requester_user_id).single();
    const recipient = user.data?.email ?? "";
    const record = await db.from("notifications").insert({ event_type: events[event].name, recipient, request_id: request.id, fiscal_year_id: request.fiscal_year_id, department_id: request.department_id }).select("id").single();
    if (record.error || !record.data) return { ok: false, message: warning + " The delivery attempt could not be logged." };
    let update: Record<string, unknown>;
    try {
      if (user.error || !z.email().safeParse(recipient).success) throw new Error("Requester email is missing or invalid.");
      const message = decisionEmail(event, request, user.data?.full_name ?? "", process.env.NEXT_PUBLIC_APP_URL!);
      const result = await sendGmail({ to: recipient, ...message });
      update = { delivery_status: "SENT", provider_message_id: result.id, sent_at: new Date().toISOString(), error: null };
    } catch {
      update = { delivery_status: "FAILED", error: !z.email().safeParse(recipient).success ? "GMAIL: requester email missing or invalid." : "GMAIL: delivery failed. Check sender authorization, Gmail API access and account restrictions." };
    }
    const logged = await db.from("notifications").update(update).eq("id", record.data.id);
    if (logged.error) return { ok: false, message: "Request saved. Email delivery result could not be recorded; check notification history before retrying." };
    return update.delivery_status === "SENT" ? { ok: true } : { ok: false, message: warning };
  } catch { return { ok: false, message: warning }; }
}
