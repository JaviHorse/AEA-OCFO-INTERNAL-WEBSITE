import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("CSV export checks access and streams all scoped rows beyond the API cap", async () => {
  const bundle = await build({
    entryPoints: ["src/app/(workspace)/reports/export/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "export-fixture",
        setup(b) {
          b.onResolve({ filter: /^@\/lib\/(auth|data)$/ }, (args) => ({
            path: args.path,
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "js",
            contents: args.path.endsWith("/auth")
              ? "export async function requireAdminPage(){if(!globalThis.__exportAllowed)throw Error('Not authorized');}"
              : "export const workspace=async(year)=>({...globalThis.__exportWorkspace,year:{id:year,code:'2627',label:'AY 2026-2027'}});",
          }));
        },
      },
    ],
  });
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const records = Array.from({ length: 1203 }, (_, i) => ({
    id: String(i),
    request_type_id: "type",
    reference_code: `AEA-${i}`,
    title: i === 0 ? '=HYPERLINK("unsafe")' : `Request ${i}`,
    department_id: "dept",
    amount: "1.25",
    status: "APPROVED",
    created_at: "2026-10-05",
    source_folder_url: "https://drive.google.com/drive/folders/example",
  }));
  const scope: unknown[] = [];
  let largest = 0;
  const db = {
    from() {
      let from = 0,
        to = 0;
      const q: any = {
        select: () => q,
        neq: () => q,
        order: () => q,
        abortSignal: () => q,
        eq(key: string, value: unknown) {
          scope.push([key, value]);
          return q;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          return q;
        },
        then(resolve: any) {
          const data = records.slice(from, Math.min(to + 1, from + 71));
          largest = Math.max(largest, data.length);
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const state = globalThis as any;
  state.__exportAllowed = false;
  state.__exportWorkspace = {
    db,
    departments: [{ id: "dept", code: "ACADS" }],
    requestTypes: [
      { id: "type", name: "Reimbursement", code: "REIMBURSEMENT" },
    ],
  };
  try {
    await assert.rejects(
      module.exports.GET(
        new Request("https://example.com/reports/export?year=year"),
      ),
      /Not authorized/,
    );
    assert.equal(scope.length, 0);
    state.__exportAllowed = true;
    const response = await module.exports.GET(
      new Request("https://example.com/reports/export?year=year"),
    );
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const text = await response.text();
    assert.equal(text.split("\r\n").length, 1205);
    assert(text.includes("AEA-1202"));
    assert(text.includes('"\'=HYPERLINK(""unsafe"")"'));
    assert(largest <= 500);
    assert(
      scope.every(
        ([key, value]: any) => key === "fiscal_year_id" && value === "year",
      ),
    );
  } finally {
    delete state.__exportAllowed;
    delete state.__exportWorkspace;
  }
});
