import { sheetsClient, inspectRegister } from "../src/lib/google-sheets";
import { createClient } from "@supabase/supabase-js";

async function main() {
try {
  const { api } = await sheetsClient();
  const target = await inspectRegister(api);
  console.log(`PASS: service account can read the request register; tab ID=${target.sheetId}; headers match all six columns.`);
} catch (error) {
  const failure = error as { code?: string | number; response?: { status?: number; data?: { error?: { status?: string; errors?: { reason?: string }[] } } } };
  console.log(`Sheets diagnostic: HTTP ${failure.response?.status ?? "unavailable"}; ${failure.response?.data?.error?.status ?? failure.code ?? "unknown"}; ${failure.response?.data?.error?.errors?.[0]?.reason ?? "unknown"}`);
  console.log("FAILED: check Google Sheets API enablement, service-account sharing and register headers.");
  process.exitCode = 1;
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error } = await db.rpc("pending_request_register_jobs", { p_request_id: null });
console.log(error ? `Sheets queue diagnostic: ${error.code || "unknown"}. Check migration 005 in the Supabase project configured in .env.local.` : "PASS: the Sheets retry queue exists in the live database.");
if (error) process.exitCode = 1;

}
main().catch(() => { console.error("Integration check failed; check network and server configuration."); process.exitCode = 1; });
