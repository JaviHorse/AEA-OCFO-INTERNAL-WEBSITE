import { getGmailClient, gmailConfig } from "../src/lib/gmail";
import { createClient } from "@supabase/supabase-js";
async function main() {
  try {
    gmailConfig();
    await getGmailClient();
    console.log(
      "PASS: Gmail refresh token authorizes the configured sender with gmail.send.",
    );
  } catch {
    console.log(
      "FAILED: complete Gmail sender authorization and check the GOOGLE_GMAIL environment variables.",
    );
    process.exitCode = 1;
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const result = await db
    .from("notifications")
    .select("delivery_status")
    .in("event_type", [
      "REQUEST_APPROVED",
      "REQUEST_REJECTED",
      "REQUEST_NEEDS_REVISION",
    ])
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) {
    console.log("FAILED: notification delivery history unavailable.");
    process.exitCode = 1;
  } else {
    const counts: Record<string, number> = {};
    for (const row of result.data ?? [])
      counts[row.delivery_status] = (counts[row.delivery_status] ?? 0) + 1;
    console.log(`Gmail decision delivery counts: ${JSON.stringify(counts)}`);
  }
  console.log("Diagnostic only: no email was sent.");
}
main().catch(() => {
  console.error("Gmail readiness check failed. Check server configuration.");
  process.exitCode = 1;
});
