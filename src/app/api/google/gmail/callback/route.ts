import { cookies } from "next/headers";
import { gmailOAuth, gmailConfig, GMAIL_SCOPE } from "@/lib/gmail";
import {
  requireGmailSetup,
  validateGmailState,
  storeLocalGmailToken,
  GmailSetupDenied,
  GMAIL_COOKIE,
  GMAIL_COOKIE_OPTIONS,
} from "@/lib/gmail-setup";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let s;
  try {
    s = await requireGmailSetup();
  } catch (error) {
    if (error instanceof GmailSetupDenied)
      return new Response(error.message, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
  const jar = await cookies();
  const cookie = jar.get(GMAIL_COOKIE)?.value;
  jar.set(GMAIL_COOKIE, "", { ...GMAIL_COOKIE_OPTIONS, maxAge: 0 });
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  let failure =
    "Gmail setup session is missing, expired, or belongs to a different browser/account. Open http://localhost:3000/api/google/gmail/authorize in the same regular browser where you signed into AEA Finance as an approving Admin. Complete consent there within 10 minutes. Avoid switching between the VS Code preview and Chrome.";
  try {
    const query = new URL(request.url).searchParams;
    const state = validateGmailState(cookie, query.get("state"), s.user.id);
    failure =
      "Google consent was cancelled or no authorization code was returned. Start authorization again and grant the requested permissions.";
    const code = query.get("code");
    if (!code || query.has("error"))
      throw new Error("Consent was not completed.");
    failure =
      "Gmail server configuration is incomplete. Check GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET, GOOGLE_GMAIL_REDIRECT_URI and GOOGLE_GMAIL_SENDER, then restart the development server.";
    const auth = gmailOAuth();
    failure =
      "Google could not exchange the authorization code. Start a fresh authorization; do not reload the callback. Check the OAuth client secret and that its registered redirect URI is exactly http://localhost:3000/api/google/gmail/callback.";
    const { tokens } = await auth.getToken({
      code,
      codeVerifier: state.verifier,
    });
    failure =
      "Gmail send permission was not granted. Start authorization again and allow sending email on your behalf.";
    if (!tokens.scope?.split(" ").includes(GMAIL_SCOPE))
      throw new Error("Required Gmail permission missing.");
    failure =
      "Google did not return the offline refresh token or identity credentials. Start authorization again and complete consent for the configured sender.";
    if (!tokens.refresh_token || !tokens.access_token || !tokens.id_token)
      throw new Error("Required tokens missing.");
    failure =
      "The Google sender identity could not be verified. Start authorization again using the configured sender account.";
    const identity = await auth.verifyIdToken({
      idToken: tokens.id_token,
      audience: gmailConfig().GOOGLE_GMAIL_CLIENT_ID,
    });
    const account = identity.getPayload();
    failure = `Wrong Google account selected. Start authorization again and choose ${gmailConfig().GOOGLE_GMAIL_SENDER}.`;
    if (
      !account?.email_verified ||
      account.email?.toLowerCase() !== gmailConfig().GOOGLE_GMAIL_SENDER
    )
      throw new Error("Wrong sender account.");
    failure =
      "The sender was verified, but its refresh token could not be saved to .env.local. Check that the file is writable, then start authorization again.";
    await storeLocalGmailToken(tokens.refresh_token);
    return new Response(
      "Gmail authorization successful. The verified sender's refresh token was saved securely in .env.local. Restart the development server before using notifications. Copy the Gmail environment variables into Vercel for deployment; no tokens were displayed or logged.",
      { headers },
    );
  } catch {
    return new Response(failure, { status: 400, headers });
  }
}
