import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/supabase/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { env } from "@/lib/env";
import { safeOauthErrorCode, classifyOauthError } from "@/lib/oauth-errors";
import { mkdir, writeFile } from "node:fs/promises";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = env().NEXT_PUBLIC_APP_URL;
  const changes: { name: string; value: string; options: CookieOptions }[] = [];
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin));
    for (const { name, value, options } of changes)
      response.cookies.set(name, value, options);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  const providerError =
    request.nextUrl.searchParams.get("error_code") ??
    request.nextUrl.searchParams.get("error");
  if (providerError)
    return NextResponse.redirect(
      new URL(`/login?error=${safeOauthErrorCode(providerError)}`, origin),
    );
  if (code) {
    const e = env();
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
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { data, error } = await db.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      const errorCode = classifyOauthError(error);
      const diagnostic = {
        at: new Date().toISOString(),
        code:
          error.code && /^[a-z_]{1,64}$/.test(error.code)
            ? error.code
            : "unclassified",
        name: /^Auth[A-Za-z]{1,60}$/.test(error.name)
          ? error.name
          : "AuthError",
        status: error.status,
        hasVerifierCookie: request.cookies
          .getAll()
          .some((c) => c.name.includes("code-verifier")),
        hasFlowId: !!flowId,
      };
      console.warn("OAuth callback classification:", diagnostic);
      if (process.env.NODE_ENV === "development") {
        await mkdir(".diagnostics", { recursive: true });
        await writeFile(".diagnostics/oauth.json", JSON.stringify(diagnostic));
      }
      return finish(`/login?error=${errorCode}`);
    }
    if (!error && data.user) {
      const u = data.user;
      const admin = serviceClient();
      const { data: setting } = await admin
        .from("organization_settings")
        .select("value")
        .eq("key", "allowed_email_domain")
        .maybeSingle();
      if (
        u.email?.toLowerCase().split("@")[1] !==
        (setting?.value ?? env().ALLOWED_EMAIL_DOMAIN)
      ) {
        await db.auth.signOut();
        return finish("/access-denied");
      }
      const { error: profileError } = await admin.from("users").upsert({
        id: u.id,
        email: u.email!.toLowerCase(),
        full_name: u.user_metadata.full_name ?? u.user_metadata.name,
        avatar_url: u.user_metadata.avatar_url,
        updated_at: new Date().toISOString(),
      });
      if (profileError) return finish("/login?error=database");
      await admin
        .from("memberships")
        .update({ user_id: u.id })
        .eq("email", u.email!.toLowerCase());
      return finish("/dashboard");
    }
  }
  return NextResponse.redirect(new URL("/login?error=missing_code", origin));
}
