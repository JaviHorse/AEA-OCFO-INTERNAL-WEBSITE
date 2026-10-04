import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeOauthErrorCode } from "@/lib/oauth-errors";
export async function POST(request: NextRequest) {
  const configurationFailure = () => {
    const response = NextResponse.redirect(
      new URL("/login?error=configuration", request.nextUrl.origin),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  let e;
  try {
    e = env();
  } catch (error) {
    // env() reports variable names only. Never expose keys or provider errors.
    console.error(
      "[auth] Sign-in configuration is incomplete:",
      error instanceof Error &&
        error.message.startsWith("Integration configuration is incomplete:")
        ? error.message
        : "Invalid server authentication settings.",
    );
    return configurationFailure();
  }
  const origin = new URL(e.NEXT_PUBLIC_APP_URL).origin;
  if (request.headers.get("origin") !== origin)
    return NextResponse.redirect(
      new URL("/login?error=origin_mismatch", origin),
      303,
    );
  const changes: { name: string; value: string; options: CookieOptions }[] = [];
  let db;
  try {
    db = createServerClient(
      e.NEXT_PUBLIC_SUPABASE_URL,
      e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            changes.push(...values);
          },
        },
      },
    );
  } catch {
    console.error("[auth] Supabase client configuration is invalid.");
    return configurationFailure();
  }
  let response: NextResponse;
  try {
    const { data, error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    response = NextResponse.redirect(
      error || !data.url
        ? new URL(`/login?error=${safeOauthErrorCode(error?.code)}`, origin)
        : data.url,
      303,
    );
  } catch {
    response = NextResponse.redirect(
      new URL("/login?error=network", origin),
      303,
    );
  }
  for (const { name, value, options } of changes)
    response.cookies.set(name, value, options);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
