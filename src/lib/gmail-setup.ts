import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { session } from "./auth";

export const GMAIL_COOKIE = "aea-gmail-setup";
export const GMAIL_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/google/gmail", maxAge: 600 };
export class GmailSetupDenied extends Error {}
export async function requireGmailSetup() {
  const s = await session();
  if (s.role !== "CFO_ADMIN") throw new GmailSetupDenied("Approving Administrator access required.");
  if (process.env.NODE_ENV !== "development") throw new GmailSetupDenied("Authorize the sender locally, then configure its refresh token in Vercel environment variables.");
  return s;
}
export function createGmailState(actor: string, verifier: string) {
  return { actor, verifier, state: randomBytes(32).toString("hex"), expires: Date.now() + 600000 };
}
export function validateGmailState(cookie: string | undefined, state: string | null, actor: string) {
  if (!cookie || !state) throw new Error("Gmail setup session expired. Start authorization again.");
  const value = JSON.parse(cookie);
  if (typeof value.state !== "string" || typeof value.verifier !== "string" || value.actor !== actor || typeof value.expires !== "number" || value.expires <= Date.now()) throw new Error("Invalid Gmail setup session.");
  const a = Buffer.from(value.state), b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid Gmail setup state.");
  return value as ReturnType<typeof createGmailState>;
}
export async function storeLocalGmailToken(token: string) {
  if (process.env.NODE_ENV !== "development" || !token || /[\r\n]/.test(token)) throw new Error("Local token storage unavailable.");
  const path = ".env.local";
  const previous = await readFile(path, "utf8");
  const entry = `GOOGLE_GMAIL_REFRESH_TOKEN=${JSON.stringify(token)}`;
  const content = /^GOOGLE_GMAIL_REFRESH_TOKEN=.*$/m.test(previous)
    ? previous.replace(/^GOOGLE_GMAIL_REFRESH_TOKEN=.*$/gm, () => entry)
    : previous.trimEnd() + "\n" + entry + "\n";
  const temp = `.env.local.gmail-${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temp, content, { mode: 0o600, flag: "wx" });
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}
