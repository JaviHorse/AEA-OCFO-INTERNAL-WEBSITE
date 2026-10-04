import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

test("server actions reject Administrator filing and member review before integration writes", async () => {
  const compiled = await build({
    entryPoints: ["src/app/actions.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "action-dependencies",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(next\/cache|next\/navigation|@\/lib\/(auth|supabase\/server|google-drive|register-sync|email|post-commit|performance))$/,
            },
            (args) => ({ path: args.path, namespace: "action-dependencies" }),
          );
          b.onLoad(
            { filter: /.*/, namespace: "action-dependencies" },
            (args) => {
              const contents =
                args.path === "@/lib/post-commit"
                  ? "export const postCommit=(_label,work)=>globalThis.__postCommitCallbacks.push(work);"
                  : args.path === "@/lib/performance"
                    ? "export const withTiming=(_label,work)=>work();"
                    : args.path === "next/cache"
                      ? "export const revalidatePath=()=>{};"
                      : args.path === "next/navigation"
                        ? "export const redirect=()=>{};"
                        : args.path === "@/lib/auth"
                          ? `export const session=async()=>globalThis.__actionContext;export const yearContext=session;export async function requireFinance(){if(globalThis.__actionContext.role!=='CFO_ADMIN')throw Error('Finance Administrator access required.');return globalThis.__actionContext;}`
                          : args.path === "@/lib/supabase/server"
                            ? `export const serviceClient=()=>({rpc(_name,input){globalThis.__integrationWrites++;globalThis.__decisionCommitted=true;return {data:{...globalThis.__decisionRequest,status:input.p.status},error:null};},from(){const q={select:()=>q,eq:()=>q,then:resolve=>Promise.resolve({count:0,error:null}).then(resolve)};return q;}});export const serverClient=()=>({});`
                            : args.path === "@/lib/google-drive"
                              ? `export class DriveError extends Error{};export const validateSubmissionFolder=async()=>{globalThis.__integrationWrites++;};`
                              : args.path === "@/lib/register-sync"
                                ? `export const syncRequestRegister=async()=>{globalThis.__integrationWrites++;return {ok:true};};`
                                : `export const notifyEvent=async()=>{if(globalThis.__notificationFailure){globalThis.__emailAfterCommit=globalThis.__decisionCommitted;throw Error("Gmail unavailable");}};export const sendNewSubmissionNotification=()=>{};export const sendSubmissionConfirmation=()=>{};export const sendDiscrepancyAlert=()=>{};`;
              return { contents, loader: "js" };
            },
          );
        },
      },
    ],
  });
  const module = {
    exports: {} as Record<string, (...args: any[]) => Promise<any>>,
  };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const state = globalThis as typeof globalThis & {
    __actionContext?: any;
    __integrationWrites?: number;
  };
  state.__integrationWrites = 0;
  const payload = {
    fiscal_year_id: "11111111-1111-4111-8111-111111111111",
    department_id: "22222222-2222-4222-8222-222222222222",
    request_type_id: "33333333-3333-4333-8333-333333333333",
    project_id: "",
    title: "Valid request",
    amount: "100.00",
    relevant_date: "2026-10-03",
    source_folder_url: "https://drive.google.com/drive/folders/abcdefghijk",
    notes: "",
    submit: true,
  };
  try {
    for (const role of ["CFO_ADMIN", "OCFO_MEMBER"]) {
      state.__actionContext = { role, yearRole: role, readOnly: false };
      const result = await module.exports.saveRequest(payload);
      assert.equal(result.ok, false);
      assert.match(result.message, /Administrator accounts cannot submit/);
    }
    state.__actionContext = {
      role: "DEPARTMENT_MEMBER",
      yearRole: "DEPARTMENT_MEMBER",
      yearMemberships: [
        { role: "DEPARTMENT_MEMBER", department_id: "another-department" },
      ],
      readOnly: false,
    };
    const wrongDepartment = await module.exports.saveRequest(payload);
    assert.match(wrongDepartment.message, /registered department/);
    for (const command of [
      "REVIEW",
      "VERIFY_DOCUMENT",
      "FLAG_ISSUE",
      "TRANSITION",
    ]) {
      const result = await module.exports.requestAction(command, {
        id: payload.fiscal_year_id,
        status: "APPROVED",
      });
      assert.equal(result.ok, false);
      assert.match(
        result.message,
        /Administrator access|cannot review or approve/,
      );
    }
    assert.equal(state.__integrationWrites, 0);
    const gmailState = globalThis as any;
    const request = {
      id: payload.fiscal_year_id,
      status: "SUBMITTED",
      fiscal_year_id: payload.fiscal_year_id,
      requester_user_id: "requester",
    };
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: request, error: null }),
    };
    state.__actionContext = {
      role: "CFO_ADMIN",
      user: { id: "admin" },
      db: { from: () => query },
    };
    gmailState.__postCommitCallbacks = [];
    gmailState.__decisionRequest = request;
    gmailState.__notificationFailure = true;
    for (const status of ["APPROVED", "REJECTED", "NEEDS_REVISION"]) {
      gmailState.__decisionCommitted = false;
      gmailState.__emailAfterCommit = false;
      const decision = await module.exports.requestAction("TRANSITION", {
        id: request.id,
        status,
        notes: "Decision notes",
      });
      assert.equal(decision.ok, true);
      assert.equal(
        gmailState.__emailAfterCommit,
        false,
        "notification must not block action response",
      );
      await gmailState.__postCommitCallbacks.shift()();
      assert.equal(gmailState.__decisionCommitted, true);
      assert.equal(gmailState.__emailAfterCommit, true);
    }
    for (const key of [
      "__postCommitCallbacks",
      "__decisionRequest",
      "__notificationFailure",
      "__decisionCommitted",
      "__emailAfterCommit",
    ])
      delete gmailState[key];
  } finally {
    delete state.__actionContext;
    delete state.__integrationWrites;
  }
});
