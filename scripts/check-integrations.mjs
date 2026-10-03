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
  const credentials = JSON.parse(await readFile("GDrive_key.json", "utf8"));
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
    subject: process.env.GOOGLE_IMPERSONATED_USER || undefined,
  });
  const api = google.drive({ version: "v3", auth });
  const { data } = await api.files.get({
    fileId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    fields: "name,mimeType,driveId,capabilities(canAddChildren)",
    supportsAllDrives: true,
  });
  console.log(
    `Drive root: accessible; folder=${data.mimeType === "application/vnd.google-apps.folder"}; sharedDrive=${!!data.driveId}; canAddChildren=${!!data.capabilities?.canAddChildren}`,
  );
  if (!data.driveId && !process.env.GOOGLE_IMPERSONATED_USER)
    console.log(
      "Drive note: service accounts cannot own copied files in My Drive. Use a Shared Drive or authorized Workspace delegation.",
    );
} catch {
  console.log(
    "Drive root: unavailable. Check credentials and service-account folder access.",
  );
}
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
