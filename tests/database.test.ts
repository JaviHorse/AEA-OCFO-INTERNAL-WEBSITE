import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("database migration, finance workflow, RLS isolation, and turnover", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('test.email',true)) $$;`,
  );
  await db.exec(await readFile("supabase/migrations/001_finance.sql", "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/002_fix_project_rls.sql", "utf8"));
  // The repair must also be safe to reapply.
  await db.exec(await readFile("supabase/migrations/002_fix_project_rls.sql", "utf8"));
  const q = async (sql: string, args: unknown[] = []) =>
    db.query<Record<string, any>>(sql, args);
  const cfo = "11111111-1111-4111-8111-111111111111",
    member = "22222222-2222-4222-8222-222222222222",
    ocfo = "33333333-3333-4333-8333-333333333333";
  await q(`insert into auth.users values($1),($2),($3)`, [cfo, member, ocfo]);
  await q(
    `insert into public.users(id,email) values($1,'cfo@student.ateneo.edu'),($2,'member@student.ateneo.edu'),($3,'ocfo@student.ateneo.edu')`,
    [cfo, member, ocfo],
  );
  const year = (
    await q(
      `insert into fiscal_years(label,code,start_date,end_date,is_active) values('AY 2026-2027','2627','2026-06-01','2027-05-31',true) returning id`,
    )
  ).rows[0].id;
  const dept = (await q(`select id from departments where code='ACADS'`))
    .rows[0].id;
  const other = (await q(`select id from departments where code='CREA'`))
    .rows[0].id;
  await q(
    `insert into memberships(user_id,email,fiscal_year_id,department_id,role) values($1,'cfo@student.ateneo.edu',$4,$5,'CFO_ADMIN'),($2,'member@student.ateneo.edu',$4,$5,'DEPARTMENT_MEMBER'),($3,'ocfo@student.ateneo.edu',$4,$5,'OCFO_MEMBER')`,
    [cfo, member, ocfo, year, dept],
  );
  await q(
    `insert into department_budgets(fiscal_year_id,department_id,initial_approved_budget) values($1,$2,1000),($1,$3,999)`,
    [year, dept, other],
  );
  const type = (
    await q(`select id from request_types where code='REIMBURSEMENT'`)
  ).rows[0].id;
  const command = async (
    actor: string,
    command: string,
    p: Record<string, unknown>,
  ) =>
    (
      await q(`select finance_command($1,$2,$3::jsonb) result`, [
        actor,
        command,
        JSON.stringify(p),
      ])
    ).rows[0].result;
  const payload = {
    fiscal_year_id: year,
    department_id: dept,
    request_type_id: type,
    project_id: "",
    title: "Expense request",
    amount: "500.00",
    relevant_date: "2026-10-03",
    source_folder_url: "https://drive.google.com/drive/folders/abcdefghijk",
    source_folder_id: "abcdefghijk",
  };
  const request = await command(member, "SUBMIT_REQUEST", payload);
  assert.equal(request.reference_code, "AEA-2627-0001");
  await assert.rejects(
    command(member, "SAVE_REQUEST", { ...payload, id: request.id }),
    /cannot be edited/,
  );
  await assert.rejects(
    command(member, "SUBMIT_REQUEST", { ...payload, department_id: other }),
    /Permission denied/,
  );
  await assert.rejects(
    command(ocfo, "TRANSITION", { id: request.id, status: "APPROVED" }),
    /Only CFO/,
  );
  await assert.rejects(
    command(cfo, "TRANSITION", { id: request.id, status: "APPROVED" }),
    /override reason/,
  );
  await command(cfo, "TRANSITION", {
    id: request.id,
    status: "APPROVED",
    notes: "Test explicit document override",
  });
  await assert.rejects(
    command(cfo, "TRANSITION", {
      id: request.id,
      status: "APPROVED",
      notes: "Duplicate approval",
    }),
    /already been approved/,
  );
  assert.equal(
    (
      await q(
        `select available_funds from department_financials where department_id=$1`,
        [dept],
      )
    ).rows[0].available_funds,
    "500.00",
  );
  const tx = {
    fiscal_year_id: year,
    department_id: dept,
    project_id: "",
    request_id: request.id,
    type: "EXPENSE",
    amount: "400.00",
    transaction_date: "2026-10-03",
    description: "Actual expense",
    idempotency_key: "44444444-4444-4444-8444-444444444444",
  };
  await command(cfo, "TRANSACTION", tx);
  assert.equal(
    (
      await q(
        `select available_funds from department_financials where department_id=$1`,
        [dept],
      )
    ).rows[0].available_funds,
    "500.00",
  );
  await assert.rejects(
    command(cfo, "TRANSACTION", tx),
    /already been recorded/,
  );
  await command(cfo, "TRANSITION", { id: request.id, status: "COMPLETED" });
  assert.equal(
    (
      await q(
        `select available_funds from department_financials where department_id=$1`,
        [dept],
      )
    ).rows[0].available_funds,
    "600.00",
  );
  assert.equal(
    (
      await q(`select status from commitments where request_id=$1`, [
        request.id,
      ])
    ).rows[0].status,
    "RELEASED",
  );
  const budgetType = (
    await q(`select id from request_types where code='BUDGET_CHANGE'`)
  ).rows[0].id;
  const change = await command(member, "SUBMIT_REQUEST", {
    ...payload,
    request_type_id: budgetType,
    amount: "-100.00",
  });
  await command(cfo, "TRANSITION", {
    id: change.id,
    status: "APPROVED",
    notes: "Approved reduction",
  });
  assert.equal(
    (
      await q(
        `select current_budget from department_financials where department_id=$1`,
        [dept],
      )
    ).rows[0].current_budget,
    "900.00",
  );
  const excess = await command(member, "SUBMIT_REQUEST", {
    ...payload,
    amount: "1000.00",
    creation_key: "66666666-6666-4666-8666-666666666666",
  });
  await assert.rejects(
    command(member, "SUBMIT_REQUEST", {
      ...payload,
      creation_key: "66666666-6666-4666-8666-666666666666",
    }),
    /already saved/,
  );
  await command(cfo, "TRANSITION", {
    id: excess.id,
    status: "APPROVED",
    notes: "Document and over-budget override",
  });
  assert.equal(
    (
      await q(
        `select count(*)::int n from discrepancies where entity_id=$1 and severity='CRITICAL'`,
        [excess.id],
      )
    ).rows[0].n,
    1,
  );
  await command(cfo, "TRANSITION", {
    id: excess.id,
    status: "CANCELLED",
    notes: "Cancel reserved expense",
  });
  assert.equal(
    (
      await q(`select remaining_amount from commitments where request_id=$1`, [
        excess.id,
      ])
    ).rows[0].remaining_amount,
    "0.00",
  );
  const overrun = await command(member, "SUBMIT_REQUEST", {
    ...payload,
    amount: "100.00",
  });
  await command(cfo, "TRANSITION", {
    id: overrun.id,
    status: "APPROVED",
    notes: "Explicit document override",
  });
  await command(cfo, "TRANSACTION", {
    ...tx,
    request_id: overrun.id,
    amount: "120.00",
    idempotency_key: "77777777-7777-4777-8777-777777777777",
  });
  await assert.rejects(
    command(cfo, "TRANSITION", { id: overrun.id, status: "COMPLETED" }),
    /critical discrepancies/,
  );
  await command(cfo, "TRANSITION", {
    id: overrun.id,
    status: "COMPLETED",
    notes: "CFO acknowledges the audited overrun",
  });
  const initialType = (
    await q(`select id from request_types where code='BUDGET_REQUEST'`)
  ).rows[0].id;
  const initial = await command(cfo, "SUBMIT_REQUEST", {
    ...payload,
    department_id: other,
    request_type_id: initialType,
    amount: "250.00",
  });
  await q(
    `update department_budgets set initial_approved_budget=0 where department_id=$1`,
    [other],
  );
  await command(cfo, "TRANSITION", {
    id: initial.id,
    status: "APPROVED",
    notes: "Initial allocation approved",
  });
  assert.equal(
    (
      await q(
        `select initial_approved_budget from department_budgets where department_id=$1`,
        [other],
      )
    ).rows[0].initial_approved_budget,
    "250.00",
  );
  await command(cfo, "COMMENT", {
    id: request.id,
    visibility: "INTERNAL_OCFO",
    notes: "Private note",
  });
  await command(member, "COMMENT", {
    id: request.id,
    visibility: "REQUESTER_VISIBLE",
    notes: "Department note",
  });
  const project = (await q(`insert into projects(fiscal_year_id,name) values($1,'Shared project') returning id`, [year])).rows[0].id;
  const privateProject = (await q(`insert into projects(fiscal_year_id,name) values($1,'Other department project') returning id`, [year])).rows[0].id;
  await q(`insert into project_departments values($1,$3),($1,$4),($2,$4)`, [project, privateProject, dept, other]);
  await q(`insert into project_members values($1,$2,$4),($1,$3,$5)`, [project, member, cfo, dept, other]);
  for (const email of ['cfo', 'ocfo']) {
    await db.exec(`set test.email='${email}@student.ateneo.edu';set role authenticated;`);
    assert.equal((await q(`select * from projects`)).rows.length, 2);
    assert.equal((await q(`select * from project_departments`)).rows.length, 3);
    assert.equal((await q(`select * from project_members`)).rows.length, 2);
    await db.exec(`reset role;`);
  }
  await db.exec(
    `set test.email='member@student.ateneo.edu';set test.uid='${member}';set role authenticated;`,
  );
  assert.equal((await q(`select * from projects`)).rows.length, 1);
  assert.equal((await q(`select * from project_departments`)).rows.length, 1);
  assert.equal((await q(`select * from project_members`)).rows.length, 1);
  assert.equal((await q(`select * from department_financials`)).rows.length, 1);
  assert.equal((await q(`select * from request_comments`)).rows.length, 1);
  await assert.rejects(
    q(`update department_budgets set initial_approved_budget=99999`),
    /permission denied/,
  );
  await db.exec(
    `reset role;set test.email='outsider@student.ateneo.edu';set role authenticated;`,
  );
  assert.equal((await q(`select * from requests`)).rows.length, 0);
  assert.equal((await q(`select * from projects`)).rows.length, 0);
  assert.equal((await q(`select * from project_departments`)).rows.length, 0);
  assert.equal((await q(`select * from project_members`)).rows.length, 0);
  await db.exec(
    `reset role;update fiscal_years set is_closed=true where id='${year}';`,
  );
  await assert.rejects(
    command(cfo, "TRANSACTION", {
      ...tx,
      idempotency_key: "55555555-5555-4555-8555-555555555555",
    }),
    /closed and read-only/,
  );
  await db.close();
});
