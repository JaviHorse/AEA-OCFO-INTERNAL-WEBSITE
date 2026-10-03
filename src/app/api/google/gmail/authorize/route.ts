import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { gmailOAuth, gmailConfig, GMAIL_SCOPE } from "@/lib/gmail";
import { createGmailState, requireGmailSetup, GmailSetupDenied, GMAIL_COOKIE, GMAIL_COOKIE_OPTIONS } from "@/lib/gmail-setup";
export const runtime = "nodejs";
export async function GET() {
  let s;
  try { s = await requireGmailSetup(); }
  catch (error) { if (error instanceof GmailSetupDenied) return new Response(error.message, { status: 403, headers: { "Cache-Control": "no-store" } }); throw error; }
  try {
    const auth = gmailOAuth();
    const pkce = await auth.generateCodeVerifierAsync();
    const value = createGmailState(s.user.id, pkce.codeVerifier);
    (await cookies()).set(GMAIL_COOKIE, JSON.stringify(value), GMAIL_COOKIE_OPTIONS);
    const url = auth.generateAuthUrl({ scope: [GMAIL_SCOPE, "openid", "email"], access_type: "offline", prompt: "consent", login_hint: gmailConfig().GOOGLE_GMAIL_SENDER, state: value.state, code_challenge: pkce.codeChallenge, code_challenge_method: "S256" as never });
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return new Response("Gmail setup configuration is incomplete. Check GOOGLE_GMAIL_CLIENT_ID, CLIENT_SECRET, REDIRECT_URI and SENDER.", { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
