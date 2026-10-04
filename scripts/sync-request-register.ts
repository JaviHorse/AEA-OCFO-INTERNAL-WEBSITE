import { createClient } from "@supabase/supabase-js";
import { syncRequestRegister } from "../src/lib/register-sync";
import { inspectRegister, sheetsClient } from "../src/lib/google-sheets";

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("request_register_sync")
    .select("request_id,version,synced_version")
    .order("updated_at")
    .limit(1000);
  if (error) throw new Error(`Register queue unavailable (${error.code}).`);
  const pending = (data ?? []).filter(
    (job) => job.version > job.synced_version,
  );
  console.log(`Queued requests: ${pending.length}`);
  for (const job of pending) {
    const result = await syncRequestRegister(job.request_id);
    console.log(
      result.ok && result.synced
        ? "Recorded one request."
        : result.message ||
            "Request remains queued; another sync worker is active.",
    );
    if (!result.ok || result.queued) process.exitCode = 1;
  }
  const { api } = await sheetsClient();
  const target = await inspectRegister(api);
  const rows = await api.spreadsheets.values.get(
    {
      spreadsheetId: target.spreadsheetId,
      range: `${target.title}!A2:A${target.rowCount}`,
    },
    { timeout: 15000 },
  );
  console.log(
    `Verified populated references in Sheets: ${(rows.data.values ?? []).filter((row) => row[0]).length}`,
  );
}
main().catch(() => {
  console.error(
    "Sync failed. Run check:register and check integration access.",
  );
  process.exitCode = 1;
});
