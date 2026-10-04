import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("database migration, finance workflow, RLS isolation, and turnover", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('test.email',true),'app_metadata',jsonb_build_object('provider',coalesce(nullif(current_setting('test.provider',true),''),'google'))) $$;`,
  );
  await db.exec(await readFile("supabase/migrations/001_finance.sql", "utf8"));
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
  await db.exec(
    await readFile("supabase/migrations/002_fix_project_rls.sql", "utf8"),
  );
  // The repair must also be safe to reapply.
  await db.exec(
    await readFile("supabase/migrations/002_fix_project_rls.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/003_allow_personal_gmail.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/003_allow_personal_gmail.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/004_portal_registration.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/004_portal_registration.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/005_google_sheets_register.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/005_google_sheets_register.sql",
      "utf8",
    ),
  );
  await db.exec(
    await readFile("supabase/migrations/006_performance_indexes.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/006_performance_indexes.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/007_confidential_budgets.sql", "utf8"),
  );
  await db.exec(
    await readFile("supabase/migrations/007_confidential_budgets.sql", "utf8"),
  );
  const q = async (sql: string, args: unknown[] = []) =>
    db.query<Record<string, any>>(sql, args);
  const cfo = "11111111-1111-4111-8111-111111111111",
    member = "22222222-2222-4222-8222-222222222222",
    ocfo = "33333333-3333-4333-8333-333333333333",
    otherMember = "99999999-9999-4999-8999-999999999999";
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
  await q(`insert into auth.users values($1)`, [otherMember]);
  await q(
    `insert into public.users(id,email) values($1,'other@student.ateneo.edu')`,
    [otherMember],
  );
  await q(
    `insert into memberships(user_id,email,fiscal_year_id,department_id,role) values($1,'other@student.ateneo.edu',$2,$3,'DEPARTMENT_MEMBER')`,
    [otherMember, year, other],
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
  for (const actor of [cfo, ocfo]) {
    await assert.rejects(
      command(actor, "SUBMIT_REQUEST", payload),
      /Administrator accounts cannot submit/,
    );
    await assert.rejects(
      command(actor, "SAVE_REQUEST", payload),
      /Administrator accounts cannot submit/,
    );
  }
  await db.exec(`set role service_role;`);
  await assert.rejects(
    q(`select finance_engine_internal($1,'SUBMIT_REQUEST',$2::jsonb)`, [
      cfo,
      JSON.stringify(payload),
    ]),
    /permission denied/,
  );
  await db.exec(`reset role;`);
  const request = await command(member, "SUBMIT_REQUEST", payload);
  await assert.rejects(
    command(member, "TRANSITION", { id: request.id, status: "APPROVED" }),
    /Only CFO|Permission denied/,
  );
  await assert.rejects(
    command(member, "COMMENT", {
      id: request.id,
      visibility: "INTERNAL_OCFO",
      notes: "Forged private note",
    }),
    /Internal|internal|Permission/,
  );

  assert.equal(request.reference_code, "AEA-2627-0001");
  const initialQueue = (
    await q(`select * from request_register_sync where request_id=$1`, [
      request.id,
    ])
  ).rows[0];
  assert.equal(initialQueue.synced_version, 0);
  const lease = (await q(`select claim_request_register_lease() token`)).rows[0]
    .token;
  assert(lease);
  assert.equal(
    (await q(`select claim_request_register_lease() token`)).rows[0].token,
    null,
  );
  assert.equal(
    (await q(`select renew_request_register_lease($1) renewed`, [lease]))
      .rows[0].renewed,
    true,
  );
  assert.equal(
    (
      await q(`select finish_request_register_sync($1,$2,$3) done`, [
        lease,
        request.id,
        initialQueue.version,
      ])
    ).rows[0].done,
    true,
  );
  assert.equal(
    (await q(`select count(*) n from pending_request_register_jobs()`)).rows[0]
      .n,
    0,
  );
  await q(`select release_request_register_lease($1)`, [lease]);
  await db.exec(`set role authenticated;`);
  await assert.rejects(
    q(`select claim_request_register_lease()`),
    /permission denied/,
  );
  await assert.rejects(
    q(`select * from pending_request_register_jobs()`),
    /permission denied/,
  );
  await db.exec(`reset role;`);

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
    /Verify every required document/,
  );
  await command(cfo, "TRANSITION", {
    id: request.id,
    status: "UNDER_OCFO_REVIEW",
  });
  await command(cfo, "TRANSITION", { id: request.id, status: "READY_FOR_CFO" });
  assert.equal(
    (await q(`select status from requests where id=$1`, [request.id])).rows[0]
      .status,
    "READY_FOR_CFO",
  );
  const changedQueue = (
    await q(`select * from request_register_sync where request_id=$1`, [
      request.id,
    ])
  ).rows[0];
  assert(changedQueue.version > changedQueue.synced_version);
  const staleLease = (await q(`select claim_request_register_lease() token`))
    .rows[0].token;
  await q(
    `update request_register_lease set expires_at=now()-interval '1 second'`,
  );
  assert.equal(
    (
      await q(`select finish_request_register_sync($1,$2,$3) done`, [
        staleLease,
        request.id,
        changedQueue.version,
      ])
    ).rows[0].done,
    false,
  );
  const currentLease = (await q(`select claim_request_register_lease() token`))
    .rows[0].token;
  await q(`select release_request_register_lease($1)`, [staleLease]);
  assert.equal(
    (await q(`select renew_request_register_lease($1) renewed`, [currentLease]))
      .rows[0].renewed,
    true,
  );
  await q(`select release_request_register_lease($1)`, [currentLease]);

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
  const initial = await command(otherMember, "SUBMIT_REQUEST", {
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
  const project = (
    await q(
      `insert into projects(fiscal_year_id,name) values($1,'Shared project') returning id`,
      [year],
    )
  ).rows[0].id;
  const privateProject = (
    await q(
      `insert into projects(fiscal_year_id,name) values($1,'Other department project') returning id`,
      [year],
    )
  ).rows[0].id;
  await q(`insert into project_departments values($1,$3),($1,$4),($2,$4)`, [
    project,
    privateProject,
    dept,
    other,
  ]);
  await q(`insert into project_members values($1,$2,$4),($1,$3,$5)`, [
    project,
    member,
    cfo,
    dept,
    other,
  ]);
  for (const email of ["cfo", "ocfo"]) {
    await db.exec(
      `set test.email='${email}@student.ateneo.edu';set role authenticated;`,
    );
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
  assert.equal((await q(`select * from department_financials`)).rows.length, 0);
  assert.equal((await q(`select * from department_budgets`)).rows.length, 0);
  assert.equal((await q(`select * from budget_adjustments`)).rows.length, 0);
  const visibleTotals = (await q(`select * from department_request_totals`))
    .rows;
  assert(visibleTotals.every((row) => row.department_id === dept));
  const expectedTotal = (
    await q(
      `select sum(amount) total from requests where status not in ('DRAFT','CANCELLED')`,
    )
  ).rows[0].total;
  assert.equal(visibleTotals[0]?.total_requested, expectedTotal);
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
  await db.exec(`reset role;`);
  const gmail = "88888888-8888-4888-8888-888888888888";
  await q(`insert into auth.users values($1)`, [gmail]);
  await q(
    `insert into public.users(id,email) values($1,'enrolled@gmail.com')`,
    [gmail],
  );
  const enroll = (email: string) =>
    q(`select admin_command($1,'MEMBERSHIP',$2::jsonb)`, [
      cfo,
      JSON.stringify({
        fiscal_year_id: year,
        department_id: dept,
        email,
        role: "DEPARTMENT_MEMBER",
        is_active: true,
      }),
    ]);
  await assert.rejects(
    enroll("cfo@student.ateneo.edu"),
    /Cannot remove the last active CFO/,
  );
  await enroll("enrolled@gmail.com");
  await assert.rejects(
    enroll("outsider@gmail.com.evil.example"),
    /Membership email/,
  );
  const gmailRequest = await command(gmail, "SUBMIT_REQUEST", {
    ...payload,
    title: "Gmail member request",
  });
  await assert.rejects(
    command(gmail, "SUBMIT_REQUEST", { ...payload, department_id: other }),
    /Permission denied/,
  );
  await db.exec(
    `set test.email='enrolled@gmail.com';set test.uid='${gmail}';set role authenticated;`,
  );
  assert.equal((await q(`select * from department_financials`)).rows.length, 0);
  assert.equal(
    (await q(`select * from requests where id=$1`, [gmailRequest.id])).rows
      .length,
    1,
  );
  assert.equal(
    (await q(`select * from requests where department_id=$1`, [other])).rows
      .length,
    0,
  );
  assert.equal(
    (await q(`select * from request_comments where visibility='INTERNAL_OCFO'`))
      .rows.length,
    0,
  );
  await db.exec(
    `reset role;set test.email='unenrolled@gmail.com';set role authenticated;`,
  );
  assert.equal((await q(`select * from requests`)).rows.length, 0);
  await db.exec(
    `reset role;update memberships set is_active=false where email='enrolled@gmail.com';`,
  );
  await assert.rejects(
    command(gmail, "SUBMIT_REQUEST", payload),
    /No active membership|registered department/,
  );
  await db.exec(`set test.email='enrolled@gmail.com';set role authenticated;`);
  assert.equal((await q(`select * from requests`)).rows.length, 0);
  await db.exec(`reset role;`);
  const registered = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await q(`insert into auth.users values($1)`, [registered]);
  await db.exec(
    `set test.email='new.member@student.ateneo.edu';set test.uid='${registered}';set role authenticated;`,
  );
  // A display name resembling a role cannot affect the fixed database permission.
  const registration = (
    await q(`select register_member($1,'CFO_ADMIN',null) result`, [dept])
  ).rows[0].result;
  assert.equal(registration.email, "new.member@student.ateneo.edu");
  assert.equal(registration.user_id, registered);
  assert.equal(registration.role, "DEPARTMENT_MEMBER");
  assert.equal((await q(`select * from department_financials`)).rows.length, 0);
  await assert.rejects(
    q(`select register_member($1,'Another registration',null)`, [other]),
    /already has a membership/,
  );
  await assert.rejects(
    q(`select register_member($1,'Forged','avatar','CFO_ADMIN')`, [dept]),
    /does not exist/,
  );
  await db.exec(`reset role;`);
  assert.equal(
    (
      await q(
        `select count(*)::int n from audit_logs where action='REGISTER_MEMBER' and actor_user_id=$1`,
        [registered],
      )
    ).rows[0].n,
    1,
  );
  await command(registered, "SUBMIT_REQUEST", {
    ...payload,
    title: "New registered member request",
  });
  await assert.rejects(
    q(`select manage_registered_user($1,$2,$3,true,false)`, [
      registered,
      registration.id,
      other,
    ]),
    /Permission denied|Administrator/,
  );
  await q(`select manage_registered_user($1,$2,$3,true,false)`, [
    cfo,
    registration.id,
    other,
  ]);
  assert.equal(
    (
      await q(
        `select count(*)::int n from memberships where email='new.member@student.ateneo.edu' and is_active`,
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    command(registered, "SUBMIT_REQUEST", payload),
    /registered department/,
  );
  const reassigned = (
    await q(
      `select id from memberships where email='new.member@student.ateneo.edu' and is_active`,
    )
  ).rows[0].id;
  await q(`select manage_registered_user($1,$2,$3,false,false)`, [
    cfo,
    reassigned,
    other,
  ]);
  await db.exec(
    `set test.email='new.member@student.ateneo.edu';set role authenticated;`,
  );
  assert.equal((await q(`select * from requests`)).rows.length, 0);
  await assert.rejects(
    q(`select register_member($1,'Reactivate myself',null)`, [dept]),
    /already has a membership/,
  );
  await db.exec(`reset role;`);
  await q(`select manage_registered_user($1,$2,$3,true,true)`, [
    cfo,
    reassigned,
    other,
  ]);
  assert.equal(
    (await q(`select role from memberships where id=$1`, [reassigned])).rows[0]
      .role,
    "CFO_ADMIN",
  );
  assert.equal(
    (
      await q(
        `select count(*)::int n from audit_logs where action='GRANT_ADMIN' and actor_user_id=$1`,
        [cfo],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    command(registered, "SUBMIT_REQUEST", { ...payload, department_id: other }),
    /Administrator accounts cannot submit/,
  );
  await db.exec(`reset role;`);
  const outsider = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await q(`insert into auth.users values($1)`, [outsider]);
  await db.exec(
    `set test.uid='${outsider}';set test.email='outsider@gmail.com';set role authenticated;`,
  );
  await assert.rejects(
    q(`select register_member($1,'Gmail self signup',null)`, [dept]),
    /Ateneo Google/,
  );
  await db.exec(
    `reset role;set test.email='outsider@student.ateneo.edu';set test.provider='email';set role authenticated;`,
  );
  await assert.rejects(
    q(`select register_member($1,'Non Google signup',null)`, [dept]),
    /Ateneo Google/,
  );
  await db.exec(
    `reset role;set test.provider='google';set role authenticated;`,
  );
  await assert.rejects(
    q(`select register_member($1,'Bad department',null)`, [
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ]),
    /active AEA department/,
  );
  await db.exec(`reset role;`);
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
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      cfo,
      JSON.stringify({
        fiscal_year_id: year,
        department_id: dept,
        amount: "20000",
        expected_budget: "1",
        reason: "Closed year test",
        idempotency_key: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      }),
    ]),
    /closed and read-only/,
  );
  await q(`update fiscal_years set is_closed=false where id=$1`, [year]);
  const beforeBudget = (
    await q(
      `select * from department_financials where fiscal_year_id=$1 and department_id=$2`,
      [year, dept],
    )
  ).rows[0];
  const budgetInput = {
    fiscal_year_id: year,
    department_id: dept,
    amount: "200000",
    expected_budget: String(beforeBudget.current_budget),
    reason: "Approved allocation update",
    idempotency_key: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  };
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      member,
      JSON.stringify(budgetInput),
    ]),
    /Permission denied/,
  );
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      ocfo,
      JSON.stringify(budgetInput),
    ]),
    /Permission denied/,
  );
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      cfo,
      JSON.stringify({ ...budgetInput, amount: "0" }),
    ]),
    /below recorded/,
  );
  await q(`select set_department_budget($1,$2)`, [
    cfo,
    JSON.stringify(budgetInput),
  ]);
  const afterBudget = (
    await q(
      `select * from department_financials where fiscal_year_id=$1 and department_id=$2`,
      [year, dept],
    )
  ).rows[0];
  assert.equal(afterBudget.current_budget, "200000.00");
  assert.equal(
    afterBudget.initial_approved_budget,
    beforeBudget.initial_approved_budget,
  );
  assert.equal(afterBudget.actual_expenses, beforeBudget.actual_expenses);
  assert.equal(afterBudget.active_commitments, beforeBudget.active_commitments);
  assert.equal(
    (
      await q(
        `select count(*)::int n from audit_logs where action='SET_DEPARTMENT_BUDGET'`,
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      cfo,
      JSON.stringify(budgetInput),
    ]),
    /budget changed/,
  );
  await db.exec(
    `set test.email='cfo@student.ateneo.edu';set test.uid='${cfo}';set role authenticated;`,
  );
  assert((await q(`select * from department_financials`)).rows.length > 0);
  await assert.rejects(
    q(`select set_department_budget($1,$2)`, [
      cfo,
      JSON.stringify(budgetInput),
    ]),
    /permission denied/,
  );
  await db.exec(`reset role;`);
  await db.close();
});
