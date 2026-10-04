import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("sign-in handles configuration failure, preserves origin checks and starts OAuth with verifier cookies", async () => {
  const state = globalThis as typeof globalThis & { __signIn: any };
  state.__signIn = { invalid: true, invalidClient: false, calls: 0 };
  const mocks: Record<string, string> = {
    "@/lib/env": `export function env(){if(globalThis.__signIn.invalid)throw Error('Integration configuration is incomplete: FINANCE_NOTIFICATION_EMAIL.');return {NEXT_PUBLIC_APP_URL:'https://finance.example.org',NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-key'};}`,
    "@supabase/ssr": `export function createServerClient(url,key,options){if(globalThis.__signIn.invalidClient)throw Error('secret-value');return {auth:{async signInWithOAuth(input){globalThis.__signIn.calls++;globalThis.__signIn.input=input;options.cookies.setAll([{name:'verifier',value:'test-verifier',options:{httpOnly:true}}]);return {data:{url:'https://accounts.google.com/o/oauth2/auth'},error:null};}}};}`,
    "next/server": `export class NextResponse extends Response{constructor(...args){super(...args);this.cookies={set:()=>this.headers.append('set-cookie','verifier=test-verifier')};}static redirect(url,status=307){return new NextResponse(null,{status,headers:{location:String(url)}});}}`,
  };
  const compiled = await build({
    entryPoints: ["src/app/auth/sign-in/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "sign-in-fixture",
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(mocks, args.path)
              ? { path: args.path, namespace: "mock" }
              : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
            contents: mocks[args.path],
            loader: "js",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const request = {
    nextUrl: new URL("https://finance.example.org/auth/sign-in"),
    headers: new Headers({ origin: "https://finance.example.org" }),
    cookies: { getAll: () => [] },
  };
  const previous = console.error;
  const errors: string[] = [];
  console.error = (...args) => {
    errors.push(args.join(" "));
  };
  try {
    let response = await module.exports.POST(request);
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://finance.example.org/login?error=configuration",
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(state.__signIn.calls, 0);
    assert.ok(errors[0].includes("FINANCE_NOTIFICATION_EMAIL"));
    state.__signIn.invalid = false;
    state.__signIn.invalidClient = true;
    response = await module.exports.POST(request);
    assert.match(response.headers.get("location"), /error=configuration/);
    assert.ok(!errors.join(" ").includes("secret-value"));
    state.__signIn.invalidClient = false;
    response = await module.exports.POST({
      ...request,
      headers: new Headers({ origin: "https://other.example.org" }),
    });
    assert.match(response.headers.get("location"), /error=origin_mismatch/);
    assert.equal(state.__signIn.calls, 0);
    response = await module.exports.POST(request);
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "https://accounts.google.com/o/oauth2/auth",
    );
    assert.equal(state.__signIn.calls, 1);
    assert.equal(
      state.__signIn.input.options.redirectTo,
      "https://finance.example.org/auth/callback",
    );
    assert.ok(response.headers.get("set-cookie"));
  } finally {
    console.error = previous;
    delete state.__signIn;
  }
});
