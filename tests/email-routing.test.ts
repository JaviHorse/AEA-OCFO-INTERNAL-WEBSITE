import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("production validation succeeds without either optional Resend variable", async () => {
  const values: Record<string, string> = {
    NEXT_PUBLIC_APP_URL: "https://finance.example.org",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    FINANCE_NOTIFICATION_EMAIL: "finance@example.org",
    CRON_SECRET: "x".repeat(32),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "integration@example.org",
    GOOGLE_PRIVATE_KEY: "test-key",
    GOOGLE_REQUESTS_SPREADSHEET_ID: "test-register",
    GOOGLE_GMAIL_CLIENT_ID: "test-client",
    GOOGLE_GMAIL_CLIENT_SECRET: "test-secret",
    GOOGLE_GMAIL_REDIRECT_URI:
      "http://localhost:3000/api/google/gmail/callback",
    GOOGLE_GMAIL_REFRESH_TOKEN: "test-token",
    GOOGLE_GMAIL_SENDER: "sender@example.org",
    GOOGLE_REQUESTS_SHEET_ID: "0",
  };
  const names = [...Object.keys(values), "RESEND_FROM_EMAIL", "RESEND_API_KEY"];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  const previousArgv = process.argv;
  const previousExitCode = process.exitCode;
  const previousLog = console.log;
  const logs: string[] = [];
  try {
    Object.assign(process.env, values);
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
    process.argv = [...previousArgv, "--production"];
    console.log = (...args) => {
      logs.push(args.join(" "));
    };
    const compiled = await build({
      entryPoints: ["scripts/check-deployment.mjs"],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
      plugins: [
        {
          name: "read-only-deployment",
          setup(b) {
            b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
              path: "db",
              namespace: "mock",
            }));
            b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
              contents: `export const createClient=()=>({from(table){return {select(){return this;},eq(){return this;},async limit(){return {data:table==='fiscal_years'?[{id:'year',is_closed:false}]:[{id:'record',total_requested:0}],error:null};}};}});`,
              loader: "js",
            }));
          },
        },
      ],
    });
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    await new AsyncFunction(compiled.outputFiles[0].text)();
    assert.equal(process.exitCode, 0);
    assert.ok(logs.some((line) => line.includes("Resend disabled")));
    assert.ok(!logs.some((line) => line.startsWith("FAIL:")), logs.join("\n"));
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    process.argv = previousArgv;
    process.exitCode = previousExitCode;
    console.log = previousLog;
  }
});

test("optional Resend skips all alerts without writes; Gmail decisions remain routed and Resend can be re-enabled", async (t) => {
  const previous = {
    sender: process.env.RESEND_FROM_EMAIL,
    key: process.env.RESEND_API_KEY,
  };
  const state = globalThis as typeof globalThis & { __emailRouting: any };
  state.__emailRouting = {
    calls: 0,
    decisions: [],
    sends: [],
    updates: [],
    fail: false,
  };
  t.after(() => {
    for (const [name, value] of [
      ["RESEND_FROM_EMAIL", previous.sender],
      ["RESEND_API_KEY", previous.key],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
    delete state.__emailRouting;
  });
  const mocks: Record<string, string> = {
    "server-only": "export {};",
    "./env":
      "export const env=()=>({NEXT_PUBLIC_APP_URL:'https://finance.example.org',FINANCE_NOTIFICATION_EMAIL:'finance@example.org'});",
    "./gmail-notifications": `export const isGmailDecision=event=>['APPROVED','REJECTED','NEEDS_REVISION'].includes(event);export async function sendDecisionNotification(event){globalThis.__emailRouting.decisions.push(event);return {ok:true};}`,
    "./supabase/server": `export const serviceClient=()=>{const s=globalThis.__emailRouting;s.calls++;return {from(table){let update;return {insert(){return this;},select(){return this;},eq(){return this;},async single(){return {data:table==='notifications'?{id:'notification'}:{name:'Finance',email:'requester@example.org',full_name:'Member'}};},async maybeSingle(){return {data:{value:'  '}};},update(value){update=value;s.updates.push(value);return this;},then(resolve){resolve({data:update});}};}};};`,
    resend: `export class Resend{constructor(key){this.emails={send:async message=>{const s=globalThis.__emailRouting;s.sends.push({key,message});return s.fail?{error:{message:'Provider failure'}}:{data:{id:'delivered'}};}};}}`,
  };
  const output = await build({
    entryPoints: ["src/lib/email.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "email-routing",
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
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const request = {
    id: "request",
    fiscal_year_id: "year",
    department_id: "department",
    request_type_id: "type",
    requester_user_id: "member",
    title: "Request",
    status: "SUBMITTED",
    amount: "10.00",
  };
  for (const [sender, key] of [
    [undefined, "key"],
    ["  ", "key"],
    ["Finance <finance@example.org>", undefined],
    ["Finance <finance@example.org>", " "],
  ]) {
    if (sender === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = sender;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
    for (const event of [
      "NEW_SUBMISSION",
      "SUBMISSION_CONFIRMATION",
      "READY_FOR_CFO",
      "CRITICAL_DISCREPANCY",
      "PROJECT_END_DUE_SOON",
      "PROJECT_END_OVERDUE",
      "MISSING_REQUIRED_DOCUMENT",
      "UNDER_OCFO_REVIEW",
      "PROCESSING",
      "COMPLETED",
      "CANCELLED",
    ])
      assert.deepEqual(await module.exports.notifyEvent(event, request), {
        ok: true,
        disabled: true,
      });
    assert.deepEqual(
      await module.exports.notify(
        "NEW_SUBMISSION",
        request,
        "finance@example.org",
      ),
      { ok: true, disabled: true },
    );
    for (const event of ["APPROVED", "REJECTED", "NEEDS_REVISION"])
      assert.deepEqual(await module.exports.notifyEvent(event, request), {
        ok: true,
      });
  }
  assert.equal(state.__emailRouting.calls, 0);
  assert.equal(state.__emailRouting.sends.length, 0);
  assert.equal(state.__emailRouting.decisions.length, 12);
  process.env.RESEND_FROM_EMAIL = " Finance <finance@example.org> ";
  process.env.RESEND_API_KEY = "resend-test-key";
  await module.exports.notify("NEW_SUBMISSION", request, "finance@example.org");
  assert.equal(
    state.__emailRouting.sends[0].message.from,
    "Finance <finance@example.org>",
  );
  assert.equal(state.__emailRouting.updates[0].delivery_status, "SENT");
  state.__emailRouting.fail = true;
  await assert.doesNotReject(
    module.exports.notify("NEW_SUBMISSION", request, "finance@example.org"),
  );
  assert.equal(state.__emailRouting.updates[1].delivery_status, "FAILED");
});
