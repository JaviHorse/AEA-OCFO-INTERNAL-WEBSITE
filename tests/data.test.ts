import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
// Execute the real page loader with a recorded database adapter. No test hooks
// or authorization bypasses are added to the application itself.
test("page loaders fetch selected datasets and retain department/request scoping", async () => {
  const compiled = await build({
    entryPoints: ["src/lib/data.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    external: ["react"],
    plugins: [
      {
        name: "test-auth-context",
        setup(b) {
          b.onResolve({ filter: /^(server-only|\.\/auth)$/ }, (args) => ({
            path: args.path,
            namespace: "test-auth-context",
          }));
          b.onLoad(
            { filter: /.*/, namespace: "test-auth-context" },
            (args) => ({
              contents:
                args.path === "server-only"
                  ? "export {};"
                  : "export const yearContext=async()=>globalThis.__testWorkspaceContext;",
              loader: "js",
            }),
          );
        },
      },
    ],
  });
  const module = {
    exports: {} as { workspace: (...args: any[]) => Promise<any> },
  };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    departments: [
      { id: "acads", code: "ACADS" },
      { id: "crea", code: "CREA" },
    ],
    requests: [
      { id: "r1", department_id: "acads", fiscal_year_id: "year" },
      { id: "r2", department_id: "crea", fiscal_year_id: "year" },
    ],
    transactions: [
      {
        id: "t1",
        request_id: "r1",
        department_id: "acads",
        fiscal_year_id: "year",
      },
      {
        id: "t2",
        request_id: "r2",
        department_id: "acads",
        fiscal_year_id: "year",
      },
    ],
  };
  const db = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const filters: [string, unknown][] = [];
      const query: any = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push([key, value]);
          rows = rows.filter((r) => r[key] === value);
          return query;
        },
        in(key: string, values: unknown[]) {
          filters.push([key, values]);
          rows = rows.filter((r) => values.includes(r[key]));
          return query;
        },
        then(resolve: (r: unknown) => unknown) {
          reads.push({ table, filters });
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const globals = globalThis as typeof globalThis & {
    __testWorkspaceContext?: unknown;
  };
  globals.__testWorkspaceContext = {
    db,
    year: { id: "year" },
    yearRole: "DEPARTMENT_MEMBER",
    yearMemberships: [{ role: "DEPARTMENT_MEMBER", department_id: "acads" }],
  };
  try {
    const result = await module.exports.workspace(undefined, [
      "departments",
      "requests",
    ]);
    assert.deepEqual(reads.map((r) => r.table).sort(), [
      "departments",
      "requests",
    ]);
    assert.deepEqual(
      result.departments.map((d: any) => d.id),
      ["acads"],
    );
    assert.deepEqual(
      result.requests.map((r: any) => r.id),
      ["r1"],
    );
    assert.deepEqual(result.transactions, []);
    reads.length = 0;
    assert.deepEqual(
      (await module.exports.workspace(undefined, ["financials"])).financials,
      [],
    );
    assert.equal(
      reads.length,
      0,
      "member renders must not query budget balances",
    );
    reads.length = 0;
    const detail = await module.exports.workspace(undefined, ["transactions"], {
      requestId: "r1",
      departmentId: "acads",
    });
    assert.deepEqual(
      detail.transactions.map((t: any) => t.id),
      ["t1"],
    );
    assert.deepEqual(
      reads.map((r) => r.table),
      ["transactions"],
    );
    assert(
      reads[0].filters.some(
        ([key, value]) => key === "request_id" && value === "r1",
      ),
    );
    globals.__testWorkspaceContext = {
      db,
      year: { id: "year" },
      yearRole: "PROJECT_MEMBER",
      yearMemberships: [{ role: "PROJECT_MEMBER", department_id: "acads" }],
    };
    assert.deepEqual(
      (await module.exports.workspace(undefined, ["requests"])).requests,
      [],
    );
    globals.__testWorkspaceContext = {
      db,
      year: { id: "year" },
      yearRole: "CFO_ADMIN",
      yearMemberships: [],
    };
    assert.equal(
      (await module.exports.workspace(undefined, ["requests"])).requests.length,
      2,
    );
  } finally {
    delete globals.__testWorkspaceContext;
  }
});
