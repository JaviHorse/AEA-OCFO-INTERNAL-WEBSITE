import pg from "pg";
import { readFile } from "node:fs/promises";
const connectionString = process.env.DATABASE_URL;
const email = process.env.INITIAL_CFO_EMAIL;
const label = process.env.INITIAL_FISCAL_YEAR_LABEL;
const code = process.env.INITIAL_FISCAL_YEAR_CODE;
const start = process.env.INITIAL_FISCAL_YEAR_START;
const end = process.env.INITIAL_FISCAL_YEAR_END;
if (!connectionString)
  throw new Error(
    "Add DATABASE_URL to .env.local, or apply the SQL files using the Supabase SQL editor.",
  );
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: true },
});
await client.connect();
try {
  const { rows } = await client.query(
    "select to_regclass('public.requests') existing",
  );
  if (!rows[0].existing)
    await client.query(
      await readFile("supabase/migrations/001_finance.sql", "utf8"),
    );
  await client.query(
    await readFile("supabase/migrations/002_fix_project_rls.sql", "utf8"),
  );
  await client.query(await readFile("supabase/seed.sql", "utf8"));
  await client.query(
    await readFile("supabase/migrations/003_allow_personal_gmail.sql", "utf8"),
  );
  await client.query(
    await readFile("supabase/migrations/004_portal_registration.sql", "utf8"),
  );
  await client.query(
    await readFile(
      "supabase/migrations/005_google_sheets_register.sql",
      "utf8",
    ),
  );
  await client.query(
    await readFile("supabase/migrations/006_performance_indexes.sql", "utf8"),
  );
  await client.query(
    await readFile("supabase/migrations/007_confidential_budgets.sql", "utf8"),
  );
  if (email && label && code && start && end) {
    const eligibility = await client.query(
      "select public.email_domain_allowed($1) allowed",
      [email],
    );
    if (!eligibility.rows[0].allowed || !/^\d{4}$/.test(code))
      throw new Error("Check initial CFO email and fiscal-year code.");
    await client.query("begin");
    const { rows: years } = await client.query(
      "insert into public.fiscal_years(label,code,start_date,end_date,is_active) values($1,$2,$3,$4,not exists(select 1 from public.fiscal_years where is_active)) on conflict(code) do update set label=excluded.label returning id",
      [label, code, start, end],
    );
    const year = years[0].id;
    await client.query(
      "insert into public.department_budgets(fiscal_year_id,department_id) select $1,id from public.departments where is_active on conflict do nothing",
      [year],
    );
    await client.query(
      "insert into public.memberships(email,fiscal_year_id,department_id,role) select lower($1),$2,id,'CFO_ADMIN' from public.departments where code='OCFO' on conflict(email,fiscal_year_id,department_id) do nothing",
      [email, year],
    );
    await client.query("commit");
    console.log("Fiscal year and initial CFO membership initialized.");
  } else
    console.log(
      "Schema and seed applied. Configure INITIAL_CFO_EMAIL and INITIAL_FISCAL_YEAR_* values to bootstrap the first membership.",
    );
  console.log("Database setup completed.");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw new Error(
    error instanceof Error ? error.message : "Database setup failed.",
  );
} finally {
  await client.end();
}
