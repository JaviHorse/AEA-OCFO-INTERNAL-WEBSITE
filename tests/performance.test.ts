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
