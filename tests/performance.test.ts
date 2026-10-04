import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("request pagination and dashboard counters retain scope and avoid full-year payloads", async () => {
  const bundle = await build({
    entryPoints: ["src/lib/page-data.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "fixtures",
        setup(b) {
          b.onResolve(
            { filter: /^(server-only|\.\/data|\.\/auth|\.\/performance)$/ },
            (a) => ({ path: a.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
            contents:
              a.path === "server-only"
                ? "export {};"
                : a.path === "./performance"
                  ? "export const withTiming=(_l,fn)=>fn();"
                  : "export const workspace=async()=>globalThis.__pageFixture;export const yearContext=workspace;",
            loader: "js",
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
  const reads: { table: string; ops: any[] }[] = [];
  let missingTotals = false;
  let totalFailure = false;
  const amounts = [
    ...Array.from({ length: 500 }, () => ({ amount: "0.01" })),
    { amount: "123.45" },
    { amount: "-20.10" },
  ];
  const fixture: any = {
    year: { id: "year" },
    role: "DEPARTMENT_MEMBER",
    yearRole: "DEPARTMENT_MEMBER",
    yearMemberships: [{ role: "DEPARTMENT_MEMBER", department_id: "dept" }],
    requestTypes: [],
    departments: [],
    projects: [],
  };
  fixture.db = {
    from(table: string) {
      const ops: any[] = [];
      const q: any = {};
      for (const name of [
        "select",
        "eq",
        "in",
        "or",
        "order",
        "range",
        "limit",
      ])
        q[name] = (...args: any[]) => {
          ops.push([name, ...args]);
          return q;
        };
      q.then = (resolve: any) => {
        reads.push({ table, ops });
        if (
          table === "department_request_totals" &&
          (missingTotals || totalFailure)
        )
          return Promise.resolve({
            data: null,
            error: { code: totalFailure ? "42501" : "PGRST205" },
          }).then(resolve);
        if (
          table === "requests" &&
          ops.some((o) => o[0] === "select" && o[1] === "amount")
        ) {
          const range = ops.find((o) => o[0] === "range");
          return Promise.resolve({
            data: amounts.slice(range[1], range[2] + 1),
            error: null,
          }).then(resolve);
        }
        return Promise.resolve({ data: [], count: 42, error: null }).then(
          resolve,
        );
      };
      return q;
    },
  };
  (globalThis as any).__pageFixture = fixture;
  try {
    const page = await module.exports.getRequestListData(
      {
        page: "2",
        q: "speaker",
        requester: "someone",
        from: "2026-01-01",
        to: "2026-12-31",
        status: "pending",
      },
      "all",
    );
    assert.equal(page.page, 2);
    assert.equal(page.count, 42);
    assert(
      reads[0].ops.some((o) => o[0] === "range" && o[1] === 25 && o[2] === 49),
    );
    assert(
      reads[0].ops.some(
        (o) => o[0] === "in" && o[1] === "department_id" && o[2][0] === "dept",
      ),
    );
    assert(
      !reads[0].ops.some((o) => o[0] === "or"),
      "removed URL filters must not affect SQL queries",
    );
    assert.equal(
      reads.length,
      1,
      "removed requester filter must not query users",
    );
    reads.length = 0;
    await module.exports.getDashboardData();
    const requestTotal = reads.find(
      (r) => r.table === "department_request_totals",
    );
    assert(requestTotal);
    assert(
      requestTotal.ops.some(
        (o) => o[0] === "eq" && o[1] === "fiscal_year_id" && o[2] === "year",
      ),
    );
    assert(
      requestTotal.ops.some(
        (o) => o[0] === "in" && o[1] === "department_id" && o[2][0] === "dept",
      ),
    );
    missingTotals = true;
    reads.length = 0;
    const fallbackDashboard = await module.exports.getDashboardData();
    assert.deepEqual(fallbackDashboard.totalRequested, ["108.35"]);
    const amountReads = reads.filter((r) =>
      r.ops.some((o) => o[0] === "select" && o[1] === "amount"),
    );
    assert.equal(
      amountReads.length,
      3,
      "sum all pages, including negative adjustments and exact cents",
    );
    for (const read of amountReads) {
      assert(
        read.ops.some(
          (o) => o[0] === "eq" && o[1] === "fiscal_year_id" && o[2] === "year",
        ),
      );
      assert(
        read.ops.some(
          (o) =>
            o[0] === "in" && o[1] === "department_id" && o[2][0] === "dept",
        ),
      );
      const states = read.ops.find(
        (o) => o[0] === "in" && o[1] === "status",
      )[2];
      assert(!states.includes("DRAFT") && !states.includes("CANCELLED"));
    }
    assert(!reads.some((r) => r.table === "department_financials"));
    totalFailure = true;
    await assert.rejects(
      module.exports.getDashboardData(),
      /Request totals could not be loaded/,
    );
    totalFailure = missingTotals = false;
    fixture.role = fixture.yearRole = "CFO_ADMIN";
    reads.length = 0;
    await module.exports.getRequestListData({}, "decisions");
    assert(
      reads[0].ops.some(
        (o) => o[0] === "in" && o[1] === "status" && o[2].includes("COMPLETED"),
      ),
    );
    assert(
      !reads[0].ops.some((o) => o[0] === "in" && o[1] === "department_id"),
    );
    reads.length = 0;
    const dashboard = await module.exports.getDashboardData();
    assert.equal(dashboard.submitted, 42);
    assert.equal(reads.length, 4);
    assert(
      reads.every((r) =>
        r.ops.some(
          (o) =>
            (o[0] === "limit" && o[1] === 5) ||
            (o[0] === "select" && o[2]?.head === true),
        ),
      ),
    );
    fixture.role = fixture.yearRole = "PROJECT_MEMBER";
    fixture.yearMemberships = [
      { role: "PROJECT_MEMBER", department_id: "dept" },
    ];
    reads.length = 0;
    await module.exports.getRequestListData({}, "all");
    assert(
      reads[0].ops.some(
        (o) => o[0] === "in" && o[1] === "department_id" && o[2].length === 0,
      ),
    );
  } finally {
    delete (globalThis as any).__pageFixture;
  }
});
