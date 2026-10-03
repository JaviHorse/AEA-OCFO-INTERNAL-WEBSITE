import Link from "next/link";
import { redirect } from "next/navigation";
import { workspace } from "@/lib/data";
import { PageHeader, Panel, Field, Badge } from "@/components/ui";
import { OperationForm } from "@/components/operation-form";
import { AuditTable } from "@/components/audit-table";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "years" } = await searchParams;
  const w = await workspace();
  if (w.role !== "CFO_ADMIN") redirect("/dashboard");
  const results = await Promise.all([
    w.db.from("memberships").select("*").order("email"),
    w.db.from("organization_settings").select("*"),
    w.db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    w.db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    w.db.from("users").select("*"),
  ]);
  for (const r of results)
    if (r.error) throw new Error("Admin records could not be loaded.");
  const [members, settings, notifications, audit, users] = results.map(
    (r) => r.data ?? [],
  );
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
      <PageHeader
        title="Administration"
        description="Build continuity into your finance operations. Manage the people, rules, and years behind the work."
      />
      <div className="admin-tabs">
        {[
          ["years", "Fiscal years"],
          ["members", "Memberships"],
          ["departments", "Departments"],
          ["projects", "Projects"],
          ["workflow", "Types & documents"],
          ["settings", "Settings"],
          ["notifications", "Notifications"],
          ["audit", "Audit trail"],
        ].map(([key, label]) => (
          <Link
            key={key}
            className={tab === key ? "active" : ""}
            href={`/admin?tab=${key}`}
          >
            {label}
          </Link>
        ))}
      </div>
      {tab === "years" && (
        <>
          <Panel
            title="Fiscal-year directory"
            subtitle="Assign the next CFO, activate the succeeding year, then close the reconciled previous year."
          >
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
          <Panel
            title="Create a new fiscal year"
            subtitle="Starts with zero balances. Departments, request types, requirements, and settings are reusable across years."
          >
            <OperationForm command="CREATE_YEAR">
              <div className="form-grid">
                <Field label="Year label">
                  <input name="label" placeholder="AY 2026-2027" required />
                </Field>
                <Field label="Reference code (YY YY)">
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
        </>
      )}
      {tab === "members" && (
        <>
          <Panel
            title="Year-specific memberships"
            subtitle="Emails may be assigned before a member’s first Google sign-in."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Fiscal year</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.email}</td>
                      <td>
                        {w.years!.find((y) => y.id === m.fiscal_year_id)?.label}
                      </td>
                      <td>
                        {
                          w.departments.find((d) => d.id === m.department_id)
                            ?.code
                        }
                      </td>
                      <td>{m.role}</td>
                      <td>
                        <Badge value={m.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel
            title="Assign or update a membership"
            subtitle="Changes to roles and access are audit logged."
          >
            <OperationForm command="MEMBERSHIP">
              <div className="form-grid">
                <Field label="Ateneo email">
                  <input type="email" name="email" required />
                </Field>
                <Field label="Fiscal year">{years}</Field>
                <Field label="Department">{departments}</Field>
                <Field label="Role">
                  <select name="role">
                    {[
                      "DEPARTMENT_MEMBER",
                      "PROJECT_MEMBER",
                      "OCFO_MEMBER",
                      "CFO_ADMIN",
                    ].map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" name="is_active" defaultChecked />
                Active membership
              </label>
            </OperationForm>
          </Panel>
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
        </>
      )}
      {tab === "projects" && (
        <>
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
                    <option>PLANNED</option>
                    <option>ACTIVE</option>
                    <option>COMPLETED</option>
                    <option>CANCELLED</option>
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
          {w.projects.map((project) => (
            <Panel title={`Edit ${project.name}`} key={project.id}>
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
                    <option>PLANNED</option>
                    <option>ACTIVE</option>
                    <option>COMPLETED</option>
                    <option>CANCELLED</option>
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
          ))}
        </>
      )}
      {tab === "workflow" && (
        <>
          <div className="admin-grid">
            {w.requestTypes.map((t) => (
              <Panel title={t.code} key={t.id}>
                <OperationForm command="REQUEST_TYPE" defaults={{ id: t.id }}>
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
                  <Field label="Workflow configuration (JSON)">
                    <textarea
                      name="process_config"
                      data-json="true"
                      defaultValue={JSON.stringify(t.process_config)}
                    />
                  </Field>
                </OperationForm>
              </Panel>
            ))}
          </div>
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
                  <input type="number" name="display_order" defaultValue={1} />
                </Field>
                <Field label="Condition">
                  <select name="condition_type">
                    <option value="">Always</option>
                    <option>AMOUNT_LT</option>
                  </select>
                </Field>
                <Field label="Condition JSON">
                  <input
                    name="condition_json"
                    data-json="true"
                    defaultValue={'{"amount":15000}'}
                  />
                </Field>
                <Field label="Template URL">
                  <input name="template_url" type="url" />
                </Field>
              </div>
              <label className="checkbox-field">
                <input name="is_required" type="checkbox" defaultChecked />
                Required
              </label>
            </OperationForm>
          </Panel>
          <Panel title="Current requirement configuration">
            {w.requirements.map((r) => (
              <p key={r.id}>
                {w.requestTypes.find((t) => t.id === r.request_type_id)?.code} ·{" "}
                {r.document_code} · {r.label}
                {r.condition_type
                  ? ` · amount < ${r.condition_json?.amount}`
                  : ""}
              </p>
            ))}
          </Panel>
        </>
      )}
      {tab === "settings" && (
        <div className="admin-grid">
          {[
            "finance_notification_email",
            "resend_from_email",
            "google_drive_root_folder_id",
            "notification_recipients",
            "report_due_days",
            "reminder_days",
            "unprocessed_warning_days",
            "long_open_warning_days",
            "ocfo_can_record_transactions",
            "allow_unlinked_transactions",
          ].map((key) => (
            <Panel title={key.replaceAll("_", " ")} key={key}>
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
                  <Field label="Value">
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
                      data-json={
                        key === "notification_recipients" ? "true" : undefined
                      }
                      defaultValue={
                        key === "notification_recipients"
                          ? JSON.stringify(values[key] ?? [])
                          : (values[key] ?? "")
                      }
                      required
                    />
                  </Field>
                )}
              </OperationForm>
            </Panel>
          ))}
          <Panel title="Finance guide">
            <p className="muted">
              CFO and OCFO members can edit guide content and FAQs directly.
            </p>
            <Link className="text-link" href="/guide">
              Edit finance guide ↗
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
                    <td>{n.event_type}</td>
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
          <AuditTable records={audit} />
        </Panel>
      )}
    </>
  );
}
