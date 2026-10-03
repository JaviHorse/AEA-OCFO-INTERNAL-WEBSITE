export function oauthErrorMessage(code?: string): string {
  switch (code) {
    case "database":
      return "Database setup is incomplete. Apply the Supabase migration and seed before completing sign-in.";
    case "origin_mismatch":
      return "Open the address configured in NEXT_PUBLIC_APP_URL before signing in. If you changed the localhost port, update .env.local and Supabase’s allowed redirect URLs, then restart the app.";
    case "access_denied":
      return "Google sign-in was cancelled or access was denied. Try again with your Ateneo Google account. If Google blocks the app, check its OAuth audience and test users.";
    case "provider_disabled":
      return "Google sign-in is not enabled in Supabase. Enable the Google provider in Authentication settings.";
    case "bad_oauth_state":
    case "flow_state_not_found":
    case "flow_state_expired":
    case "invalid_request":
    case "code_verifier_missing":
    case "bad_code_verifier":
    case "pkce_verifier_missing":
    case "pkce_code_verifier_not_found":
    case "pkce_verifier_mismatch":
      return "Your sign-in session expired or its browser cookie is missing. Start again from this page using the same browser and website address. Avoid switching between localhost and 127.0.0.1.";
    case "validation_failed":
      return "Supabase rejected the sign-in code exchange. Start a new sign-in from this page; old callback links cannot be reused. Check that the callback URL is allowed in Supabase.";
    case "unexpected_failure":
      return "Supabase could not finish sign-in. Check Authentication logs in Supabase for the failed token exchange.";
    case "missing_code":
      return "Google did not return a sign-in code. Check that Supabase allows the app’s /auth/callback redirect URL, then start sign-in again.";
    case "provider_error":
      return "Google rejected the sign-in request. Check the OAuth client ID, secret, authorized redirect URI, and allowed test users in Google Cloud and Supabase.";
    case "network":
      return "The website server could not reach Supabase’s sign-in service. Check its internet access and firewall settings, then try again.";
    default:
      return "Sign-in could not be completed. Check the Google OAuth settings and start again. If Google shows an error code, share that code with the administrator.";
  }
}
export function classifyOauthError(error: {
  code?: string;
  name?: string;
}): string {
  return error.name === "AuthRetryableFetchError"
    ? "network"
    : safeOauthErrorCode(error.code);
}
export function safeOauthErrorCode(code?: string): string {
  const known = [
    "access_denied",
    "provider_disabled",
    "bad_oauth_state",
    "flow_state_not_found",
    "flow_state_expired",
    "invalid_request",
    "code_verifier_missing",
    "bad_code_verifier",
    "pkce_verifier_missing",
    "pkce_code_verifier_not_found",
    "validation_failed",
    "unexpected_failure",
    "origin_mismatch",
    "pkce_verifier_mismatch",
    "provider_error",
    "missing_code",
  ];
  return code && known.includes(code) ? code : "oauth";
}
