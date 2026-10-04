import { createClient } from "@supabase/supabase-js";

if (
  !process.env.RESEND_FROM_EMAIL?.trim() ||
  !process.env.RESEND_API_KEY?.trim()
) {
  console.log(
    "INFO: Resend disabled: RESEND_FROM_EMAIL or RESEND_API_KEY is missing. Optional alerts/reminders are skipped; Gmail decision emails use check:gmail.",
  );
  process.exit(0);
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const [setting, notifications] = await Promise.all([
  db
    .from("organization_settings")
    .select("value")
    .eq("key", "resend_from_email")
    .maybeSingle(),
  db
    .from("notifications")
    .select("delivery_status")
    .in("event_type", [
      "NEW_SUBMISSION",
      "SUBMISSION_CONFIRMATION",
      "READY_FOR_CFO",
      "UNDER_OCFO_REVIEW",
      "PROCESSING",
      "COMPLETED",
      "CANCELLED",
      "MISSING_REQUIRED_DOCUMENT",
      "CRITICAL_DISCREPANCY",
      "PROJECT_END_DUE_SOON",
      "PROJECT_END_OVERDUE",
    ])
    .order("created_at", { ascending: false })
    .limit(100),
]);
const sender =
  (typeof setting.data?.value === "string" && setting.data.value.trim()) ||
  process.env.RESEND_FROM_EMAIL?.trim();
const email =
  typeof sender === "string"
    ? (sender.match(/<([^>]+)>/)?.[1] || sender).trim()
    : "";
console.log(
  email
    ? "PASS: notification sender is configured."
    : "FAILED: configure a verified notification sender in Administration.",
);
if (!email || setting.error) process.exitCode = 1;
if (notifications.error) console.log("Notification history could not be read.");
else {
  const counts = {};
  for (const row of notifications.data ?? [])
    counts[row.delivery_status] = (counts[row.delivery_status] || 0) + 1;
  console.log(
    `Recent Resend alert/reminder delivery counts: ${JSON.stringify(counts)}`,
  );
}
if (!email)
  console.log(
    "Domain verification requires a configured sender address first.",
  );
else
  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      console.log(
        `Domain verification check unavailable (HTTP ${response.status}; sending-only API keys cannot list domains).`,
      );
    else {
      const result = await response.json();
      const domain = email.split("@").pop()?.toLowerCase();
      const configured = result.data?.find(
        (item) => item.name.toLowerCase() === domain,
      );
      console.log(
        configured?.status === "verified"
          ? "PASS: sender domain is verified in Resend."
          : "FAILED: sender domain is not verified for this Resend account; testing senders restrict recipients.",
      );
      if (configured?.status !== "verified") process.exitCode = 1;
    }
  } catch {
    console.log(
      "Domain verification check unavailable: network request failed.",
    );
    process.exitCode = 1;
  }
