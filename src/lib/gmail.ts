import "server-only";
import { google } from "googleapis";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export function gmailConfig() {
  const schema = z.object({
    GOOGLE_GMAIL_CLIENT_ID: z.string().min(1),
    GOOGLE_GMAIL_CLIENT_SECRET: z.string().min(1),
    GOOGLE_GMAIL_REDIRECT_URI: z.url(),
    GOOGLE_GMAIL_SENDER: z.email().transform(value => value.toLowerCase()),
    GOOGLE_GMAIL_REFRESH_TOKEN: z.string().optional(),
  });
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error("Gmail configuration is incomplete. Check the server-side GOOGLE_GMAIL variables.");
  return parsed.data;
}
export function gmailOAuth() {
  const c = gmailConfig();
  return new google.auth.OAuth2({ clientId: c.GOOGLE_GMAIL_CLIENT_ID, clientSecret: c.GOOGLE_GMAIL_CLIENT_SECRET, redirectUri: c.GOOGLE_GMAIL_REDIRECT_URI, transporterOptions: { timeout: 15000, retry: false } });
}
export async function getGmailClient() {
  const token = gmailConfig().GOOGLE_GMAIL_REFRESH_TOKEN;
  if (!token) throw new Error("Reconnect the configured Gmail sender.");
  const auth = gmailOAuth();
  auth.setCredentials({ refresh_token: token });
  const access = await auth.getAccessToken();
  if (!access.token) throw new Error("Reconnect the configured Gmail sender.");
  const identity = await auth.getTokenInfo(access.token);
  if (identity.email?.toLowerCase() !== gmailConfig().GOOGLE_GMAIL_SENDER || !identity.scopes.includes(GMAIL_SCOPE)) throw new Error("The Gmail token does not authorize the configured sender.");
  return google.gmail({ version: "v1", auth });
}
export function encodeMimeMessage({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }) {
  if (!z.email().safeParse(to).success || /[\r\n]/.test(to + subject)) throw new Error("Invalid email headers.");
  const boundary = `aea-${randomUUID()}`;
  const encodeBody = (body: string) => Buffer.from(body, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const words: string[] = [];
  let chunk = "";
  for (const character of subject) {
    if (Buffer.byteLength(chunk + character) > 42) { words.push(chunk); chunk = ""; }
    chunk += character;
  }
  words.push(chunk);
  const encodedSubject = words.map(word => `=?UTF-8?B?${Buffer.from(word).toString("base64")}?=`).join("\r\n ");
  const headers = [`From: AEA Finance <${gmailConfig().GOOGLE_GMAIL_SENDER}>`, `To: ${to}`, `Subject: ${encodedSubject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomUUID()}@student.ateneo.edu>`, "MIME-Version: 1.0"];
  const part = (kind: string, body: string) => `Content-Type: text/${kind}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodeBody(body)}`;
  const body = text !== undefined
    ? `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n--${boundary}\r\n${part("plain", text)}\r\n--${boundary}\r\n${part("html", html)}\r\n--${boundary}--`
    : part("html", html);
  return Buffer.from(headers.join("\r\n") + "\r\n" + body + "\r\n").toString("base64url");
}
export async function sendGmail(message: { to: string; subject: string; html: string; text?: string }) {
  const raw = encodeMimeMessage(message);
  const api = await getGmailClient();
  const result = await api.users.messages.send({ userId: "me", requestBody: { raw } }, { timeout: 15000, retry: false });
  if (!result.data.id) throw new Error("Gmail did not confirm the send.");
  return result.data;
}
