// Read-only database probes. No document contents, IDs or credentials are logged.
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const year = await db
  .from("fiscal_years")
  .select("id")
  .eq("is_active", true)
  .maybeSingle();
if (year.error || !year.data)
  throw new Error("Read-only measurement needs an accessible active year.");
const probes = {
  "baseline.requests.all": () =>
    db
      .from("requests")
      .select("*")
      .eq("fiscal_year_id", year.data.id)
      .order("created_at", { ascending: false }),
  "optimized.requests.page": () =>
    db
      .from("requests")
      .select(
        "id,reference_code,fiscal_year_id,department_id,project_id,request_type_id,requester_user_id,title,amount,status,created_at,submitted_at,updated_at",
        { count: "exact" },
      )
      .eq("fiscal_year_id", year.data.id)
      .in("status", ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(0, 24),
  "optimized.dashboard.recent": () =>
    db
      .from("requests")
      .select(
        "id,reference_code,fiscal_year_id,department_id,project_id,request_type_id,requester_user_id,title,amount,status,created_at,submitted_at,updated_at",
      )
      .eq("fiscal_year_id", year.data.id)
      .order("created_at", { ascending: false })
      .limit(5),
  "optimized.dashboard.counter": () =>
    db
      .from("requests")
      .select("id", { head: true, count: "exact" })
      .eq("fiscal_year_id", year.data.id)
      .eq("status", "SUBMITTED"),
};
const measurements = [];
for (let trial = 0; trial < 3; trial++)
  for (const [label, query] of Object.entries(probes)) {
    const start = performance.now();
    const r = await query();
    const ms = +(performance.now() - start).toFixed(1);
    if (r.error) throw new Error(`Read-only probe failed (${r.error.code}).`);
    measurements.push({
      label,
      trial,
      ms,
      rows: r.data?.length ?? 0,
      count: r.count,
      serializedBytes: Buffer.byteLength(JSON.stringify(r.data)),
    });
  }
await mkdir("artifacts/performance", { recursive: true });
await writeFile(
  "artifacts/performance/database-probes.json",
  JSON.stringify(
    {
      context:
        "Service-role read-only probes, not authenticated route/RLS or EXPLAIN measurements. Baseline may be capped by PostgREST default row limit. First probe includes connection warmup.",
      measurements,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(measurements, null, 2));
