import "server-only";
import { serviceClient } from "./supabase/server";
import { sheetsClient, writeRegisterRequest } from "./google-sheets";
import { env } from "./env";
import type { FinanceRequest } from "./types";

export async function syncRequestRegister(requestId?: string) {
  const db = serviceClient();
  const lease = await db.rpc("claim_request_register_lease");
  if (lease.error) return { ok: false, message: "Sheets recording is unavailable. Apply migration 005 and check integration settings.", synced: 0 };
  if (!lease.data) return { ok: true, queued: true, synced: 0 };
  const token = lease.data as string;
  let synced = 0;
  let message = "";
  try {
    const { data: queue, error } = await db.rpc("pending_request_register_jobs", { p_request_id: requestId ?? null });
    if (error) throw new Error("The Sheets retry queue could not be loaded.");
    const pending = (queue ?? []) as { request_id: string; version: number; synced_version: number }[];
    if (!pending.length) return { ok: true, synced: 0 };
    const { api } = await sheetsClient();
    for (const job of pending) {
      try {
        const { data: r, error: requestError } = await db.from("requests").select("*").eq("id", job.request_id).single();
        if (requestError || !r) throw new Error("The request could not be loaded for Sheets recording.");
        const [dept, person, type, project] = await Promise.all([
          db.from("departments").select("code,name").eq("id", r.department_id).single(),
          db.from("users").select("full_name,email").eq("id", r.requester_user_id).single(),
          db.from("request_types").select("name").eq("id", r.request_type_id).single(),
          r.project_id ? db.from("projects").select("name").eq("id", r.project_id).single() : Promise.resolve({ data: null, error: null }),
        ]);
        if ([dept, person, type, project].some((v) => v.error)) throw new Error("Request context could not be loaded for Sheets recording.");
        const note = `Department: ${dept.data?.code}\nRequester: ${person.data?.full_name ?? ""}\nEmail: ${person.data?.email ?? ""}\nType: ${type.data?.name}\nProject: ${project.data?.name ?? "General department request"}`;
        await writeRegisterRequest(api, r as FinanceRequest, env().NEXT_PUBLIC_APP_URL, note, async () => {
          const renewed = await db.rpc("renew_request_register_lease", { p_token: token });
          if (renewed.error || !renewed.data) throw new Error("The Sheets recording lease expired; the request remains queued.");
        });
        const result = await db.rpc("finish_request_register_sync", { p_token: token, p_request_id: job.request_id, p_version: job.version, p_error: null });
        if (result.error || !result.data) throw new Error("The Sheets update could not be acknowledged; retry will reuse the same reference.");
        synced++;
      } catch {
        message = "Sheets recording failed. Check service-account access and the six register headers, then retry.";
        await db.rpc("finish_request_register_sync", { p_token: token, p_request_id: job.request_id, p_version: job.version, p_error: message });
      }
    }
    return { ok: !message, synced, message: message || undefined };
  } catch {
    return { ok: false, synced, message: "Sheets recording is unavailable. The request remains queued for retry." };
  } finally {
    await db.rpc("release_request_register_lease", { p_token: token });
  }
}
