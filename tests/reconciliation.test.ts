import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";

test("reconciliation scans beyond the response cap using bounded related batches", async () => {
  const bundle = await build({
    entryPoints: ["src/lib/reconciliation.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    plugins: [
      {
        name: "reconciliation-fixture",
        setup(b) {
          b.onResolve(
            {
              filter:
                /^(server-only|\.\/supabase\/server|\.\/email|\.\/google-drive|\.\/performance)$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "js",
            contents:
              args.path === "server-only"
                ? "export {};"
                : args.path === "./supabase/server"
                  ? "export const serviceClient=()=>globalThis.__reconcileDB;"
                  : args.path === "./email"
                    ? "export const notifyEvent=async()=>{};"
                    : args.path === "./google-drive"
                      ? "export const listFolderFiles=async()=>[];"
                      : "export const withTiming=(_label,work)=>work();",
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
  const records = Array.from({ length: 1250 }, (_, i) => ({
    id: String(i).padStart(5, "0"),
    fiscal_year_id: "year",
    department_id: "dept",
    request_type_id: i === 1 ? "budget" : "expense",
    status: i === 0 ? "COMPLETED" : "SUBMITTED",
    amount: i === 1 ? "10000.00" : "1.00",
    submitted_at: new Date().toISOString(),
    source_folder_id: null,
  }));
  const flags: any[] = [];
  const tables: Record<string, any[]> = {
    requests: records,
    transactions: Array.from({ length: 1203 }, (_, i) => ({
      id: String(i).padStart(5, "0"),
      fiscal_year_id: "year",
      request_id: records[0].id,
      department_id: i === 0 ? "wrong" : "dept",
      type: "EXPENSE",
      amount: "0.01",
    })),
    commitments: [
      {
        id: "c",
        fiscal_year_id: "year",
        request_id: records[0].id,
        status: "ACTIVE",
        remaining_amount: "1.00",
      },
    ],
    department_financials: [
      {
        id: "f",
        fiscal_year_id: "year",
        department_id: "dept",
        available_funds: "100.00",
        actual_expenses: "12.03",
        current_budget: "112.03",
      },
    ],
    organization_settings: [],
    request_types: [
      { id: "budget", creates_commitment: false },
      { id: "expense", creates_commitment: true },
    ],
  };
  let largestRequestPayload = 0;
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let from = 0;
      let to = Infinity;
      let inserted = false;
      const q: any = {
        select: () => q,
        order: () => q,
        eq(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        neq(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] !== value);
          return q;
        },
        in(key: string, values: unknown[]) {
          rows = rows.filter((r) => values.includes(r[key]));
          return q;
        },
        is(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] === value);
          return q;
        },
        not(key: string, _op: string, value: unknown) {
          rows = rows.filter((r) => r[key] !== value);
          return q;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          return q;
        },
        limit(limit: number) {
          to = limit - 1;
          return q;
        },
        insert(value: unknown) {
          flags.push(value);
          inserted = true;
          return q;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then(resolve: any) {
          const data = rows.slice(from, Math.min(to + 1, from + 73));
          if (table === "requests")
            largestRequestPayload = Math.max(
              largestRequestPayload,
              data.length,
            );
          return Promise.resolve({
            data,
            error: null,
            count: inserted ? 1 : 0,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  (globalThis as any).__reconcileDB = db;
  try {
    const result = await module.exports.reconcileYear("year");
    assert.equal(result.checked, 1250);
    assert(largestRequestPayload <= 100);
    assert.deepEqual(flags.map((f) => f.code).sort(), [
      "ACTUAL_EXCEEDS_APPROVED",
      "TERMINAL_ACTIVE_COMMITMENT",
      "WRONG_DEPARTMENT",
    ]);
    assert(
      !flags.some((f) => f.entity_id === records[1].id),
      "budget requests must not be treated as expense reservations",
    );
  } finally {
    delete (globalThis as any).__reconcileDB;
  }
});
