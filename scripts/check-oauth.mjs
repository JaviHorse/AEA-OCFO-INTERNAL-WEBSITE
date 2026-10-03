// Read-only checks: no sign-in, session exchange, or configuration changes.
const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
const settings = await fetch(`${base}/auth/v1/settings`, {
  headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
});
const data = await settings.json();
console.log(
  JSON.stringify({
    settingsStatus: settings.status,
    googleEnabled: data.external?.google,
    supabaseGoogleCallback: `${base}/auth/v1/callback`,
    appCallback: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    allowedDomain: process.env.ALLOWED_EMAIL_DOMAIN,
  }),
);
const url = new URL(`${base}/auth/v1/authorize`);
url.searchParams.set("provider", "google");
url.searchParams.set(
  "redirect_to",
  `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
);
url.searchParams.set(
  "hd",
  process.env.ALLOWED_EMAIL_DOMAIN ?? "student.ateneo.edu",
);
const response = await fetch(url, { redirect: "manual" });
const location = response.headers.get("location");
if (location) {
  const target = new URL(location);
  console.log(
    JSON.stringify({
      authorizeStatus: response.status,
      providerHost: target.hostname,
      googleRedirectUri: target.searchParams.get("redirect_uri"),
      hostedDomain: target.searchParams.get("hd"),
    }),
  );
} else {
  const error = await response.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      authorizeStatus: response.status,
      errorCode: error.error_code ?? error.error,
      providerMessage: error.msg ?? error.message,
    }),
  );
}
