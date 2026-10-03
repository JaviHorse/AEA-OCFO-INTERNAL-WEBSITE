import Link from "next/link";
import { workspace } from "@/lib/data";
import { money, cents, isFinance } from "@/lib/finance";
import { PageHeader, Panel, Badge, Field, Empty } from "@/components/ui";
import { OperationForm } from "@/components/operation-form";
import { VerifyRecord } from "@/components/verify-record";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  const [
    { data: commitments, error: cError },
    { data: reports, error: rError },
  ] = await Promise.all([
    w.db
      .from("commitments")
      .select("*")
      .eq("fiscal_year_id", w.year.id)
      .eq("status", "ACTIVE"),
    w.db.from("project_reports").select("*").eq("fiscal_year_id", w.year.id),
  ]);
  if (cError || rError) throw new Error("Reports could not be loaded.");
  const total = (
    key:
      | "current_budget"
      | "actual_expenses"
      | "actual_revenue"
      | "active_commitments"
      | "available_funds",
  ) => w.financials.reduce((n, f) => n + cents(f[key]), 0n);
  return (
    <>
      <PageHeader
        title="Reports & reconciliation"
        description="Close the loop on your financial activity. Carry clear records into the next year."
      />
      <Panel title={`${w.year.label} · financial summary`}>
        <div className="summary-grid">
          {[
            ["Approved budget", "current_budget"],
            ["Actual expenses", "actual_expenses"],
            ["Revenue", "actual_revenue"],
            ["Commitments", "active_commitments"],
            ["Available funds", "available_funds"],
          ].map(([label, key]) => (
            <div key={key}>
              <small>{label}</small>
              <strong>{money(total(key as "current_budget"))}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Department summaries">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th>Budget</th>
                <th>Expenses</th>
                <th>Revenue</th>
                <th>Commitments</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              {w.financials.map((f) => (
                <tr key={f.department_id}>
                  <td>
                    {w.departments.find((d) => d.id === f.department_id)?.code}
                  </td>
                  <td>{money(f.current_budget)}</td>
                  <td>{money(f.actual_expenses)}</td>
                  <td>{money(f.actual_revenue)}</td>
                  <td>{money(f.active_commitments)}</td>
                  <td>{money(f.available_funds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Outstanding commitments">
        {commitments?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Original amount</th>
                  <th>Remaining</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link
                        className="text-link"
                        href={`/requests/${c.request_id}`}
                      >
                        {
                          w.requests.find((r) => r.id === c.request_id)
                            ?.reference_code
                        }{" "}
                        ↗
                      </Link>
                    </td>
                    <td>{money(String(c.original_amount))}</td>
                    <td>{money(String(c.remaining_amount))}</td>
                    <td>
                      {new Date(c.created_at).toLocaleDateString("en-PH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No outstanding commitments"
            description="Approved requests with unrealized expenses will appear here."
          />
        )}
      </Panel>
      <Panel
        title="Reconciliation & discrepancies"
        subtitle="Issues stay traceable after they are resolved or dismissed."
      >
        {w.issues.length ? (
          w.issues.map((i) => (
            <div className="review-entry" key={i.id}>
              <div className="issue-row">
                <Badge value={i.severity} />
                <strong>{i.code}</strong>
                <Badge value={i.status} />
              </div>
              <p>{i.description}</p>
              {i.resolution_notes && <p>Resolution: {i.resolution_notes}</p>}
              {w.yearRole === "CFO_ADMIN" &&
                !w.readOnly &&
                i.status === "OPEN" && (
                  <details>
                    <summary>Resolve this issue</summary>
                    <OperationForm
                      kind="resolve"
                      defaults={{ id: i.id }}
                      label="Record resolution"
                    >
                      <Field label="Resolution">
                        <select name="status">
                          <option>RESOLVED</option>
                          <option>DISMISSED</option>
                        </select>
                      </Field>
                      <Field label="Resolution notes">
                        <textarea name="notes" required minLength={3} />
                      </Field>
                    </OperationForm>
                  </details>
                )}
            </div>
          ))
        ) : (
          <Empty
            title="Everything is in the clear"
            description="No discrepancies have been detected for this fiscal year."
          />
        )}
      </Panel>
      <Panel title="Project-end / revenue reports">
        {reports?.length ? (
          reports.map((r) => (
            <div className="review-entry" key={r.id}>
              <strong>
                {w.projects.find((p) => p.id === r.project_id)?.name}
              </strong>
              <p>
                {w.departments.find((d) => d.id === r.department_id)?.code} ·
                Expenses {money(String(r.total_expenses))} · Revenue{" "}
                {money(String(r.total_revenue))} · Variance{" "}
                {money(String(r.variance))}
              </p>
              <Badge value={r.status} />
              {w.yearRole &&
                isFinance(w.yearRole) &&
                !w.readOnly &&
                r.status !== "VERIFIED" && (
                  <VerifyRecord kind="report" id={r.id} />
                )}
            </div>
          ))
        ) : (
          <p className="muted">No project-end report submissions.</p>
        )}
        {!w.readOnly && (
          <details>
            <summary>Submit a project-end report</summary>
            <OperationForm
              kind="report"
              defaults={{ fiscal_year_id: w.year.id }}
              label="Submit report"
            >
              <div className="form-grid">
                <Field label="Project">
                  <select name="project_id" required>
                    {w.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Department">
                  <select name="department_id" required>
                    {w.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Project-end request">
                  <select name="request_id" required>
                    <option value="">Select submitted request</option>
                    {w.requests
                      .filter(
                        (r) =>
                          w.requestTypes.find((t) => t.id === r.request_type_id)
                            ?.code === "PROJECT_END_REVENUE",
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.reference_code ?? r.title}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Total expenses">
                  <input
                    type="number"
                    name="total_expenses"
                    step="0.01"
                    min="0"
                    required
                  />
                </Field>
                <Field label="Total revenue">
                  <input
                    type="number"
                    name="total_revenue"
                    step="0.01"
                    min="0"
                    required
                  />
                </Field>
                <Field label="Reported variance">
                  <input type="number" name="variance" step="0.01" required />
                </Field>
              </div>
            </OperationForm>
          </details>
        )}
      </Panel>
    </>
  );
}
