const settingLabels: Record<string, string> = {
  finance_notification_email: "Finance notification email",
  resend_from_email: "Email sender address",
  notification_recipients: "Additional notification recipients",
  report_due_days: "Project-end report deadline",
  reminder_days: "Reminder timing",
  unprocessed_warning_days: "Processing follow-up timing",
  long_open_warning_days: "Open request follow-up timing",
  ocfo_can_record_transactions: "Allow OCFO to record transactions",
  allow_unlinked_transactions: "Allow transactions without a linked request",
};
import Link from "next/link";
import { pageNumber, requestListColumns } from "@/lib/page-data";
import type { FinanceRequest } from "@/lib/types";
import { ServerFilterForm } from "@/components/server-filter-form";
import { redirect } from "next/navigation";
import { human, money } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { workspace, type Dataset } from "@/lib/data";
import { PageHeader, Panel, Field, Badge } from "@/components/ui";
import { OperationForm } from "@/components/operation-form";
import { AuditTable } from "@/components/audit-table";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    actor?: string;
    entity?: string;
    action?: string;
    date?: string;
    email?: string;
  }>;
}) {
  const params = await searchParams;
  const { tab = "years" } = params;
  const page = pageNumber(params.page);
  const offset = (page - 1) * 50;
  const tabDatasets: Record<string, Dataset[]> = {
    years: ["years"],
    finance: ["departments", "financials", "requestTypes"],
    members: ["years", "departments"],
    departments: ["departments"],
    projects: ["years", "departments", "projects", "projectDepartments"],
    types: ["requestTypes"],
    requirements: ["requestTypes", "requirements"],
    workflow: ["requestTypes", "requirements"],
  };
  const w = await workspace(undefined, tabDatasets[tab] ?? []);
  if (w.role !== "CFO_ADMIN") redirect("/dashboard");
  const empty = Promise.resolve({ data: [], error: null });
  const auditQuery = w.db
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  const memberQuery = w.db
    .from("memberships")
    .select("*", { count: "exact" })
    .order("email")
    .order("id");
  if (params.email)
    memberQuery.ilike(
      "email",
      `%${params.email.slice(0, 160).replace(/[%_]/g, "")}%`,
    );
  if (params.actor && /^[0-9a-f-]{36}$/i.test(params.actor))
    auditQuery.eq("actor_user_id", params.actor);
  if (params.entity)
    auditQuery.ilike(
      "entity_type",
      `%${params.entity.slice(0, 80).replace(/[%_]/g, "")}%`,
    );
  if (params.action)
    auditQuery.ilike(
      "action",
      `%${params.action.slice(0, 80).replace(/[%_]/g, "")}%`,
    );
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date))
    auditQuery
      .gte("created_at", `${params.date}T00:00:00`)
      .lte("created_at", `${params.date}T23:59:59.999999`);
  const pageHref = (next: number) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (v && k !== "page") query.set(k, v);
    query.set("tab", tab);
    query.set("page", String(next));
    return `/admin?${query}`;
  };
  const results = await Promise.all([
    tab === "members" ? memberQuery.range(offset, offset + 49) : empty,
    tab === "settings" ? w.db.from("organization_settings").select("*") : empty,
    tab === "notifications"
      ? w.db
          .from("notifications")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 49)
      : empty,
    tab === "audit" ? auditQuery.range(offset, offset + 49) : empty,
    tab === "projects" ? w.db.from("users").select("*") : empty,
    tab === "finance"
      ? w.db
          .from("requests")
          .select(requestListColumns, { count: "exact" })
          .eq("fiscal_year_id", w.year.id)
          .in("status", ["APPROVED", "PROCESSING"])
          .in(
            "request_type_id",
            w.requestTypes
              .filter(
                (t) => t.creates_commitment || t.code === "PROJECT_END_REVENUE",
              )
              .map((t) => t.id),
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 49)
      : empty,
  ]);
  for (const r of results)
    if (r.error) throw new Error("Admin records could not be loaded.");
  const [members, settings, notifications, audit, projectUsers] = results.map(
    (r) => r.data ?? [],
  );
  const memberUsers =
    tab === "members" && members.length
      ? await w.db
          .from("users")
          .select("id,full_name,email")
          .in("id", [...new Set(members.map((m) => m.user_id).filter(Boolean))])
      : { data: [], error: null };
  if (memberUsers.error)
    throw new Error("Registered users could not be loaded.");
  const users = tab === "members" ? (memberUsers.data ?? []) : projectUsers;
  const total =
    results[
      tab === "finance"
        ? 5
        : tab === "members"
          ? 0
          : tab === "notifications"
            ? 2
            : 3
    ];
  const financeRequests = (results[5].data ?? []) as FinanceRequest[];
  const count = "count" in total ? Number(total.count ?? 0) : 0;
  const values = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const departments = (
    <select name="department_id" required>
      {w.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.code} · {d.name}
        </option>
      ))}
    </select>
  );
  const years = (
    <select name="fiscal_year_id" defaultValue={w.year.id}>
      {w.years!.map((y) => (
        <option key={y.id} value={y.id}>
          {y.label}
          {y.is_closed ? " (closed)" : ""}
        </option>
      ))}
    </select>
  );
  return (
    <>
      {["members", "audit"].includes(tab) && (
        <ServerFilterForm key={JSON.stringify(params)}>
          <input type="hidden" name="tab" value={tab} />
          {tab === "members" ? (
            <label>
              Email
              <input name="email" defaultValue={params.email} />
            </label>
          ) : (
            <>
              <label>
                Actor ID
                <input name="actor" defaultValue={params.actor} />
              </label>
              <label>
                Entity
                <input name="entity" defaultValue={params.entity} />
              </label>
              <label>
                Action
                <input name="action" defaultValue={params.action} />
              </label>
              <label>
                Audit date
                <input type="date" name="date" defaultValue={params.date} />
              </label>
            </>
          )}
        </ServerFilterForm>
      )}
      {["members", "audit", "notifications", "finance"].includes(tab) && (
        <nav className="pagination" aria-label="Admin pages">
          <span>
            {count} records - Page {page} of{" "}
            {Math.max(1, Math.ceil(count / 50))}
          </span>
          {page > 1 && (
            <Link className="button secondary" href={pageHref(page - 1)}>
              Previous
            </Link>
          )}
          {page * 50 < count && (
            <Link className="button secondary" href={pageHref(page + 1)}>
              Next
            </Link>
          )}
        </nav>
      )}
      <PageHeader title="Administration" />
      <div className="admin-tabs">
        {[
          ["members", "Members", ["members"]],
          ["years", "Fiscal Years", ["years"]],
          ["finance", "Finance", ["finance"]],
          ["departments", "Departments", ["departments", "projects"]],
          ["types", "Request Setup", ["types", "requirements", "workflow"]],
          ["settings", "Settings", ["settings"]],
          ["notifications", "System Logs", ["notifications", "audit"]],
        ].map(([key, label, children]) => (
          <Link
            key={String(key)}
            className={(children as string[]).includes(tab) ? "active" : ""}
            href={`/admin?tab=${key}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {tab === "finance" && (
        <>
          <Panel title={`Department Budgets · ${w.year.label}`}>
            <p>
              Set each department’s current allocation here. Every change is
              recorded as an approved budget adjustment with your explanation.
              Existing spending and commitments remain intact. Department budget
              requests and changes can also be updated through the normal
              approval process.
            </p>
            {w.financials.map((f) => (
              <details className="help-disclosure" key={f.department_id}>
                <summary>
                  {w.departments.find((d) => d.id === f.department_id)?.name} ·{" "}
                  {money(f.current_budget)}
                </summary>
                <div className="disclosure-body">
                  <p>
                    Spent {money(f.actual_expenses)} · Committed{" "}
                    {money(f.active_commitments)} · Available{" "}
                    {money(f.available_funds)} · Revenue{" "}
                    {money(f.actual_revenue)}
                  </p>
                  {!w.readOnly && (
                    <OperationForm
                      kind="budget"
                      label="Update Budget"
                      confirm
                      defaults={{
                        fiscal_year_id: w.year.id,
                        department_id: f.department_id,
                        expected_budget: String(f.current_budget),
                        idempotency_key: crypto.randomUUID(),
                      }}
                    >
                      <Field label="New current budget (₱)">
                        <input
                          name="amount"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={f.current_budget}
                          required
                        />
                      </Field>
                      <Field label="Reason for adjustment">
                        <textarea
                          name="reason"
                          minLength={3}
                          maxLength={1000}
                          required
                        />
                      </Field>
                    </OperationForm>
                  )}
                </div>
              </details>
            ))}
          </Panel>
          <Panel title="Record Expenses & Revenue">
            <p>
              Spent and Revenue are calculated from transactions. Record the
              actual payment or receipt here; the financial summary updates
              automatically. Choose an approved or processing request.
              Transactions must match its department, project, and request type.
            </p>
            {!w.readOnly && financeRequests.length === 0 && (
              <p>
                No approved or processing requests are ready for transaction
                recording.
              </p>
            )}
            {!w.readOnly ? (
              financeRequests.map((r) => {
                const t = w.requestTypes.find(
                  (t) => t.id === r.request_type_id,
                )!;
                return (
                  <details className="help-disclosure" key={r.id}>
                    <summary>
                      {r.reference_code ?? r.title} · {money(r.amount)}
                    </summary>
                    <div className="disclosure-body">
                      <p>
                        {r.title} ·{" "}
                        {
                          w.departments.find((d) => d.id === r.department_id)
                            ?.name
                        }{" "}
                        ·{" "}
                        {t.code === "PROJECT_END_REVENUE"
                          ? "Revenue"
                          : "Expense"}
                      </p>
                      <OperationForm
                        kind="transaction"
                        label="Record Transaction"
                        confirm
                        defaults={{
                          fiscal_year_id: w.year.id,
                          department_id: r.department_id,
                          request_id: r.id,
                          project_id: r.project_id ?? "",
                          type:
                            t.code === "PROJECT_END_REVENUE"
                              ? "REVENUE"
                              : "EXPENSE",
                          idempotency_key: crypto.randomUUID(),
                        }}
                      >
                        <Field label="Actual amount (₱)">
                          <input
                            name="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                          />
                        </Field>
                        <Field label="Transaction date">
                          <input
                            name="transaction_date"
                            type="date"
                            min={w.year.start_date}
                            max={w.year.end_date}
                            required
                          />
                        </Field>
                        <Field label="Description">
                          <textarea
                            name="description"
                            minLength={3}
                            maxLength={1000}
                            required
                          />
                        </Field>
                      </OperationForm>
                    </div>
                  </details>
                );
              })
            ) : (
              <p>This fiscal year is closed and read-only.</p>
            )}
            <Link className="text-link" href={`/approvals?year=${w.year.id}`}>
              Review requests →
            </Link>
          </Panel>
        </>
      )}
      {(["departments", "projects"].includes(tab) ||
        ["types", "requirements", "workflow"].includes(tab) ||
        ["notifications", "audit"].includes(tab)) && (
        <div className="admin-subtabs">
          {(["departments", "projects"].includes(tab)
            ? [
                ["departments", "Departments"],
                ["projects", "Projects"],
              ]
            : ["types", "requirements", "workflow"].includes(tab)
              ? [
                  ["types", "Types"],
                  ["requirements", "Requirements"],
                ]
              : [
                  ["notifications", "Notifications"],
                  ["audit", "Audit"],
                ]
          ).map(([key, label]) => (
            <Link
              key={key}
              className={tab === key ? "active" : ""}
              href={`/admin?tab=${key}`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      {tab === "years" && (
        <>
          <details className="help-disclosure">
            <summary>Year setup instructions</summary>
            <div>
              <h2>Set up the next academic year</h2>
              <ol>
                <li>
                  Create the year with its dates. Shared department and document
                  settings remain available.
                </li>
                <li>
                  Use Members to assign next year’s members and Finance
                  Administrator.
                </li>
                <li>
                  Approve department Budget Requests to establish allocations.
                </li>
                <li>
                  Activate the new year, then close the reconciled previous
                  year.
                </li>
              </ol>
            </div>
          </details>
          <Panel title="Fiscal Years">
            {w.years!.map((y) => (
              <div className="review-entry" key={y.id}>
                <div className="issue-row">
                  <strong>{y.label}</strong>
                  <span>
                    {y.start_date} — {y.end_date}
                  </span>
                  <Badge
                    value={
                      y.is_closed
                        ? "CLOSED"
                        : y.is_active
                          ? "ACTIVE"
                          : "INACTIVE"
                    }
                  />
                </div>
                {!y.is_active && !y.is_closed && (
                  <div className="action-buttons">
                    <OperationForm
                      command="ACTIVATE_YEAR"
                      defaults={{ fiscal_year_id: y.id }}
                      label="Activate year"
                      confirm
                    >
                      <span />
                    </OperationForm>
                    <OperationForm
                      command="CLOSE_YEAR"
                      defaults={{ fiscal_year_id: y.id }}
                      label="Close year"
                      confirm
                    >
                      <span />
                    </OperationForm>
                  </div>
                )}
              </div>
            ))}
          </Panel>
          <details className="help-disclosure">
            <summary>+ Create Year</summary>
            <Panel
              title="Create a new fiscal year"
              subtitle="Starts with zero balances. Departments, request types, requirements, and settings are reusable across years."
            >
              <OperationForm command="CREATE_YEAR">
                <div className="form-grid">
                  <Field label="Academic year name">
                    <input name="label" placeholder="AY 2026-2027" required />
                  </Field>
                  <Field label="Reference year code (e.g. 2627)">
                    <input
                      name="code"
                      pattern="[0-9]{4}"
                      placeholder="2627"
                      required
                    />
                  </Field>
                  <Field label="Start date">
                    <input type="date" name="start_date" required />
                  </Field>
                  <Field label="End date">
                    <input type="date" name="end_date" required />
                  </Field>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" name="copy_config" defaultChecked />
                  Copy year-specific guides from the active year
                </label>
              </OperationForm>
            </Panel>
          </details>
        </>
      )}
      {tab === "members" && (
        <>
          <Panel title="Registered Users">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Name",
                      "Email",
                      "Department",
                      "Fiscal Year",
                      "Registered On",
                      "Account",
                      "Status",
                      "Actions",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const profile = users.find((u) => u.id === m.user_id);
                    const closed = w.years!.some(
                      (y) => y.id === m.fiscal_year_id && y.is_closed,
                    );
                    return (
                      <tr key={m.id}>
                        <td>{profile?.full_name ?? "Not signed in yet"}</td>
                        <td>{m.email}</td>
                        <td>
                          {
                            w.departments.find((d) => d.id === m.department_id)
                              ?.code
                          }
                        </td>
                        <td>
                          {
                            w.years!.find((y) => y.id === m.fiscal_year_id)
                              ?.label
                          }
                        </td>
                        <td>
                          {profile?.created_at
                            ? new Date(profile.created_at).toLocaleDateString(
                                "en-PH",
                              )
                            : "Awaiting sign-in"}
                        </td>
                        <td>{human(m.role)}</td>
                        <td>
                          <Badge value={m.is_active ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td>
                          {!closed &&
                            ["DEPARTMENT_MEMBER", "PROJECT_MEMBER"].includes(
                              m.role,
                            ) && (
                              <details>
                                <summary>Manage Account</summary>
                                <OperationForm
                                  kind="member"
                                  defaults={{ membership_id: m.id }}
                                  label="Update Account"
                                  confirm
                                >
                                  <Field label="Department">
                                    <select
                                      name="department_id"
                                      defaultValue={m.department_id}
                                    >
                                      {w.departments
                                        .filter((d) => d.is_active)
                                        .map((d) => (
                                          <option key={d.id} value={d.id}>
                                            {d.name} ({d.code})
                                          </option>
                                        ))}
                                    </select>
                                  </Field>
                                  <label className="checkbox-field">
                                    <input
                                      type="checkbox"
                                      name="enabled"
                                      defaultChecked={m.is_active}
                                    />
                                    Account active
                                  </label>
                                  <label className="checkbox-field">
                                    <input type="checkbox" name="promote" />
                                    Grant Finance Administrator access
                                  </label>
                                </OperationForm>
                              </details>
                            )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <details className="help-disclosure">
            <summary>Assign Account Access</summary>
            <Panel
              title="Assign Account Access"
              subtitle="Enroll an account, carry access into a new fiscal year, or update Administrator privileges. Use Manage Account above to change a Member's department."
            >
              <OperationForm
                command="MEMBERSHIP"
                confirm
                label="Save Account Access"
              >
                <div className="form-grid">
                  <Field label="Ateneo or Gmail email">
                    <input type="email" name="email" required />
                  </Field>
                  <Field label="Fiscal Year">{years}</Field>
                  <Field label="Department">{departments}</Field>
                  <Field label="Account Type">
                    <select name="role">
                      <option value="DEPARTMENT_MEMBER">Member</option>
                      <option value="CFO_ADMIN">Finance Administrator</option>
                    </select>
                  </Field>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" name="is_active" defaultChecked />
                  Access enabled
                </label>
              </OperationForm>
            </Panel>
          </details>
        </>
      )}
      {tab === "departments" && (
        <>
          <Panel title="Department directory">
            {w.departments.map((d) => (
              <div className="review-entry" key={d.id}>
                {d.code} · {d.name} · {d.is_active ? "Active" : "Inactive"}
              </div>
            ))}
          </Panel>
          <details className="help-disclosure">
            <summary>Create or update a department</summary>
            <Panel title="Create or update a department">
              <OperationForm command="DEPARTMENT">
                <div className="form-grid">
                  <Field label="Department code">
                    <input name="code" required maxLength={12} />
                  </Field>
                  <Field label="Name">
                    <input name="name" required />
                  </Field>
                </div>
                <label className="checkbox-field">
                  <input type="checkbox" name="is_active" defaultChecked />
                  Active
                </label>
              </OperationForm>
            </Panel>
          </details>
        </>
      )}
      {tab === "projects" && (
        <>
          <details className="help-disclosure">
            <summary>Create a project</summary>
            <Panel title="Create a project">
              <OperationForm command="PROJECT">
                <div className="form-grid">
                  <Field label="Name">
                    <input name="name" required />
                  </Field>
                  <Field label="Fiscal year">{years}</Field>
                  <Field label="Start date">
                    <input name="start_date" type="date" />
                  </Field>
                  <Field label="End date">
                    <input name="end_date" type="date" />
                  </Field>
                  <Field label="Status">
                    <select name="status">
                      <option value="PLANNED">Planned</option>
                      <option value="ACTIVE">Active</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </Field>
                  <Field
                    label="Participating departments"
                    hint="Hold Ctrl or Cmd to select multiple."
                  >
                    <select name="department_ids" multiple required>
                      {w.departments.map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.code}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea name="description" />
                </Field>
              </OperationForm>
            </Panel>
          </details>
          <details className="help-disclosure">
            <summary>Assign Project Member</summary>
            <Panel
              title="Assign a project member"
              subtitle="Project access supplements department membership and never crosses its boundaries."
            >
              <OperationForm
                command="PROJECT_MEMBER"
                defaults={{ fiscal_year_id: w.year.id }}
              >
                <Field label="Project">
                  <select name="project_id" required>
                    {w.projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="User">
                  <select name="user_id" required>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Department">{departments}</Field>
              </OperationForm>
            </Panel>
          </details>
          {w.projects.map((project) => (
            <details className="help-disclosure" key={project.id}>
              <summary>{project.name}</summary>
              <Panel title="Edit Project">
                <OperationForm
                  command="PROJECT"
                  defaults={{
                    id: project.id,
                    fiscal_year_id: project.fiscal_year_id,
                  }}
                >
                  <Field label="Name">
                    <input name="name" defaultValue={project.name} required />
                  </Field>
                  <Field label="Description">
                    <textarea
                      name="description"
                      defaultValue={project.description ?? ""}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="Start">
                      <input
                        type="date"
                        name="start_date"
                        defaultValue={project.start_date ?? ""}
                      />
                    </Field>
                    <Field label="End">
                      <input
                        type="date"
                        name="end_date"
                        defaultValue={project.end_date ?? ""}
                      />
                    </Field>
                  </div>
                  <Field label="Status">
                    <select name="status" defaultValue={project.status}>
                      <option value="PLANNED">Planned</option>
                      <option value="ACTIVE">Active</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>
                  </Field>
                  <Field label="Departments">
                    <select
                      name="department_ids"
                      multiple
                      defaultValue={w.projectDepartments
                        .filter((pd) => pd.project_id === project.id)
                        .map((pd) => pd.department_id)}
                    >
                      {w.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code}
                        </option>
                      ))}
                    </select>
                  </Field>
                </OperationForm>
              </Panel>
            </details>
          ))}
        </>
      )}
      {(tab === "types" || tab === "requirements" || tab === "workflow") && (
        <>
          {tab !== "requirements" && (
            <div className="admin-grid">
              {w.requestTypes.map((t) => (
                <details className="help-disclosure" key={t.id}>
                  <summary>{requestTypeLabel(t)}</summary>
                  <Panel title="Edit Request Type">
                    <OperationForm
                      command="REQUEST_TYPE"
                      defaults={{ id: t.id, process_config: t.process_config }}
                    >
                      <Field label="Display name">
                        <input name="name" defaultValue={t.name} required />
                      </Field>
                      <Field label="Description">
                        <textarea
                          name="description"
                          defaultValue={t.description ?? ""}
                        />
                      </Field>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name="is_active"
                          defaultChecked={t.is_active}
                        />
                        Active
                      </label>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name="creates_commitment"
                          defaultChecked={t.creates_commitment}
                        />
                        Creates commitment on approval
                      </label>
                    </OperationForm>
                  </Panel>
                </details>
              ))}
            </div>
          )}
          {tab !== "types" && (
            <>
              <details className="help-disclosure">
                <summary>+ Add Requirement</summary>
                <Panel
                  title="Add or update a document requirement"
                  subtitle="Use the same type and document code to update an existing requirement."
                >
                  <OperationForm command="REQUIREMENT">
                    <div className="form-grid">
                      <Field label="Request type">
                        <select name="request_type_id">
                          {w.requestTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Document code">
                        <input
                          name="document_code"
                          required
                          pattern="[A-Z0-9_]+"
                          placeholder="PDAF"
                        />
                      </Field>
                      <Field label="Label">
                        <input name="label" required />
                      </Field>
                      <Field label="Order">
                        <input
                          type="number"
                          name="display_order"
                          defaultValue={1}
                        />
                      </Field>
                      <Field label="Condition">
                        <select name="condition_type">
                          <option value="">Always</option>
                          <option value="AMOUNT_LT">
                            Required below an amount
                          </option>
                        </select>
                      </Field>
                      <Field
                        label="Amount threshold (PHP)"
                        hint="Used only for conditional documents. PDAF is required strictly below this amount."
                      >
                        <input
                          name="condition_amount"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue="15000"
                        />
                      </Field>
                      <Field label="Template URL">
                        <input name="template_url" type="url" />
                      </Field>
                    </div>
                    <label className="checkbox-field">
                      <input
                        name="is_required"
                        type="checkbox"
                        defaultChecked
                      />
                      Required
                    </label>
                  </OperationForm>
                </Panel>
              </details>
              <Panel title="Document Requirements">
                {w.requirements.map((r) => (
                  <p key={r.id}>
                    {
                      w.requestTypes.find((t) => t.id === r.request_type_id)
                        ?.code
                    }{" "}
                    · {r.document_code} · {r.label}
                    {r.condition_type
                      ? ` · amount < ${r.condition_json?.amount}`
                      : ""}
                  </p>
                ))}
              </Panel>
            </>
          )}
        </>
      )}
      {tab === "settings" && (
        <div className="admin-grid">
          {[
            "finance_notification_email",
            "resend_from_email",
            "notification_recipients",
            "report_due_days",
            "reminder_days",
            "unprocessed_warning_days",
            "long_open_warning_days",
            "ocfo_can_record_transactions",
            "allow_unlinked_transactions",
          ].map((key) => (
            <details className="help-disclosure" key={key}>
              <summary>{settingLabels[key]}</summary>
              <Panel title="Edit Setting">
                <OperationForm command="SETTING" defaults={{ key }}>
                  {[
                    "ocfo_can_record_transactions",
                    "allow_unlinked_transactions",
                  ].includes(key) ? (
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        name="value"
                        defaultChecked={!!values[key]}
                      />
                      Enabled
                    </label>
                  ) : (
                    <Field
                      label={
                        key === "notification_recipients"
                          ? "Email addresses (separate with commas)"
                          : key.endsWith("_days")
                            ? "Number of days"
                            : "Setting"
                      }
                    >
                      <input
                        name="value"
                        type={
                          key.endsWith("_days")
                            ? "number"
                            : key === "notification_recipients"
                              ? "text"
                              : key.endsWith("_email")
                                ? "email"
                                : "text"
                        }
                        data-emails={
                          key === "notification_recipients" ? "true" : undefined
                        }
                        defaultValue={
                          key === "notification_recipients"
                            ? (values[key] ?? []).join(", ")
                            : (values[key] ?? "")
                        }
                        required
                      />
                    </Field>
                  )}
                </OperationForm>
              </Panel>
            </details>
          ))}
          <Panel title="Help & Requirements">
            <p className="muted">
              Finance administrators can edit help content and FAQs directly.
            </p>
            <Link className="text-link" href="/guide">
              Edit Help & Requirements ↗
            </Link>
          </Panel>
        </div>
      )}
      {tab === "notifications" && (
        <Panel
          title="Notification delivery history"
          subtitle="Failures stay visible and never undo a valid submission."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td>{human(n.event_type)}</td>
                    <td>{n.recipient}</td>
                    <td>
                      <Badge value={n.delivery_status} />
                    </td>
                    <td>{n.sent_at ?? "—"}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 300 }}>
                      {n.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === "audit" && (
        <Panel
          title="Audit trail"
          subtitle="The latest 200 actions. Records are immutable for browser clients."
        >
          <AuditTable filters={false} records={audit} />
        </Panel>
      )}
    </>
  );
}
