import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeOauthErrorCode } from "@/lib/oauth-errors";
export async function POST(request: NextRequest) {
  const e = env();
  const origin = new URL(e.NEXT_PUBLIC_APP_URL).origin;
  if (request.headers.get("origin") !== origin)
    return NextResponse.redirect(
      new URL("/login?error=origin_mismatch", origin),
      303,
    );
  const changes: { name: string; value: string; options: CookieOptions }[] = [];
  const db = createServerClient(
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
