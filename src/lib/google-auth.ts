import "server-only";
import { google } from "googleapis";
import { readFile } from "node:fs/promises";

export async function googleAuth(scopes: string[]) {
  let credentials: { client_email: string; private_key: string };
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    credentials = { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("Configure the Google service account in production environment variables.");
    credentials = JSON.parse(await readFile("GDrive_key.json", "utf8"));
  }
  return { auth: new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes, subject: process.env.GOOGLE_IMPERSONATED_USER || undefined }), email: credentials.client_email };
}
