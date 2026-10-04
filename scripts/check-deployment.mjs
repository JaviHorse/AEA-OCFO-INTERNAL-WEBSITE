import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FINANCE_NOTIFICATION_EMAIL",
];
let failed = false;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failed = true;
}
for (const name of required)
  check(`Configured ${name}`, Boolean(process.env[name]));
check(
  "Finance recipient is a valid email",
  z.email().safeParse(process.env.FINANCE_NOTIFICATION_EMAIL).success,
);
if (process.argv.includes("--production")) {
  const requiredProduction = [
    "CRON_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_REQUESTS_SPREADSHEET_ID",
    "GOOGLE_GMAIL_CLIENT_ID",
    "GOOGLE_GMAIL_CLIENT_SECRET",
    "GOOGLE_GMAIL_REDIRECT_URI",
    "GOOGLE_GMAIL_REFRESH_TOKEN",
    "GOOGLE_GMAIL_SENDER",
  ];
  for (const name of requiredProduction)
    check(`Production ${name}`, Boolean(process.env[name]));
  let publicUrl;
  try {
    publicUrl = new URL(process.env.NEXT_PUBLIC_APP_URL);
  } catch {}
  check(
    "Production app URL uses HTTPS and a public host",
    Boolean(
      publicUrl &&
      publicUrl.protocol === "https:" &&
      publicUrl.pathname === "/" &&
      !publicUrl.search &&
      !publicUrl.hash &&
      !publicUrl.username &&
      !publicUrl.password &&
      !["localhost", "127.0.0.1"].includes(publicUrl.hostname),
    ),
  );
  check(
    "Cron secret contains at least 32 characters",
    (process.env.CRON_SECRET?.length ?? 0) >= 32,
  );
  check(
    "Google service account email is valid",
    z.email().safeParse(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL).success,
  );
  check(
    "Gmail sender email is valid",
    z.email().safeParse(process.env.GOOGLE_GMAIL_SENDER).success,
  );
  check(
    "Register tab ID is numeric",
    /^\d+$/.test(process.env.GOOGLE_REQUESTS_SHEET_ID ?? "0"),
  );
  let gmailCallback;
  try {
    gmailCallback = new URL(process.env.GOOGLE_GMAIL_REDIRECT_URI);
  } catch {}
  check(
    "Gmail callback matches the sender-authorization route",
    Boolean(
      gmailCallback &&
      gmailCallback.pathname === "/api/google/gmail/callback" &&
      !gmailCallback.search &&
      !gmailCallback.hash &&
      !gmailCallback.username &&
      !gmailCallback.password &&
      (gmailCallback.protocol === "https:" ||
        (gmailCallback.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(gmailCallback.hostname))),
    ),
  );
}
console.log(
  process.env.RESEND_FROM_EMAIL?.trim() && process.env.RESEND_API_KEY?.trim()
    ? "INFO: Resend enabled; verify its sender domain separately before sending."
    : "INFO: Resend disabled (sender or API key missing); optional alerts/reminders will be skipped. Gmail decision delivery remains required.",
);
if (required.every((name) => process.env[name])) {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    },
  );
  for (const [table, column] of [
    ["fiscal_years", "id"],
    ["requests", "id"],
    ["request_register_sync", "request_id"],
    ["department_request_totals", "total_requested"],
  ]) {
    try {
      const result = await db.from(table).select(column).limit(1);
      check(`Database ${table} is accessible`, !result.error);
    } catch {
      check(`Database ${table} is accessible`, false);
    }
  }
  const active = await db
    .from("fiscal_years")
    .select("id,is_closed")
    .eq("is_active", true)
    .limit(2);
  check(
    "Exactly one open active fiscal year",
    !active.error && active.data?.length === 1 && !active.data[0].is_closed,
  );
  if (active.data?.length === 1) {
    const cfo = await db
      .from("memberships")
      .select("id")
      .eq("fiscal_year_id", active.data[0].id)
      .eq("role", "CFO_ADMIN")
      .eq("is_active", true)
      .limit(1);
    check(
      "Active CFO membership exists for the current year",
      !cfo.error && cfo.data?.length === 1,
    );
  }
}
console.log(
  "Read-only checks completed; no finance records, emails, or files were changed.",
);
process.exitCode = failed ? 1 : 0;
