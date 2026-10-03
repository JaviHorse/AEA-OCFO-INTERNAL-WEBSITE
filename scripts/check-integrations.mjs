import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { readFile } from "node:fs/promises";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
for (const table of [
  "fiscal_years",
  "departments",
  "memberships",
  "requests",
]) {
  const { data, error, status } = await db.from(table).select("*").limit(1);
  console.log(
    `${table}: ${error ? `${error.code} — ${error.message}` : `HTTP ${status}; rows=${data?.length ?? 0}; columns=${Object.keys(data?.[0] ?? {}).join(",")}`}`,
  );
}
try {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    ? { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") }
    : JSON.parse(await readFile("GDrive_key.json", "utf8"));
  const auth = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"], subject: process.env.GOOGLE_IMPERSONATED_USER || undefined });
  const api = google.sheets({ version: "v4", auth });
  const { data } = await api.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_REQUESTS_SPREADSHEET_ID, fields: "sheets.properties" });
  console.log(`Sheets register: accessible; configured tab exists=${data.sheets?.some((s) => s.properties.sheetId === Number(process.env.GOOGLE_REQUESTS_SHEET_ID || "0"))}`);
} catch { console.log("Sheets register: unavailable. Enable the Sheets API and verify Editor sharing with the service account."); }
try {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  console.log(
    `Resend: ${res.ok ? "key connected" : `verification unavailable (HTTP ${res.status}; restricted sending keys may not list domains)`}`,
  );
} catch {
  console.log("Resend: network unavailable.");
}
