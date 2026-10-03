import { notFound } from "next/navigation";
import Link from "next/link";
import { workspace } from "@/lib/data";
import { money } from "@/lib/finance";
import { PageHeader, Panel, Badge } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
export default async function DepartmentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  const w = await workspace(p.year);
  const d = w.departments.find((d) => d.id === id);
  if (!d) notFound();
  const f = w.financials.find((f) => f.department_id === id);
  const { data: adjustments } = await w.db
    .from("budget_adjustments")
    .select("*")
    .eq("department_id", id)
    .eq("fiscal_year_id", w.year.id);
  return (
    <>
      <PageHeader
        eyebrow={`${d.code} · ${w.year.label}`}
        title={d.name}
        description="Department allocation, financial history, and linked projects."
      />
      <Panel title="Financial position">
        <div className="summary-grid">
          {[
            ["Initial budget", f?.initial_approved_budget],
            ["Approved adjustments", f?.adjustments],
            ["Current budget", f?.current_budget],
            ["Actual expenses", f?.actual_expenses],
            ["Commitments", f?.active_commitments],
            ["Available funds", f?.available_funds],
            ["Revenue", f?.actual_revenue],
          ].map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{money(value ?? "0")}</strong>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Budget adjustment history">
        {adjustments?.length ? (
          adjustments.map((a) => (
            <p key={a.id}>
              {a.type} · {money(String(a.amount_delta))} · {a.reason} ·{" "}
              {new Date(a.approved_at).toLocaleDateString("en-PH")}
            </p>
          ))
        ) : (
          <p className="muted">No approved adjustments.</p>
        )}
      </Panel>
      <Panel title="Department requests">
        <RequestTable
          requests={w.requests.filter((r) => r.department_id === id)}
          departments={[d]}
          types={w.requestTypes}
          projects={w.projects}
          yearId={w.year.id}
        />
      </Panel>
      <Panel title="Transactions">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {w.transactions
                .filter((t) => t.department_id === id)
                .map((t) => (
                  <tr key={t.id}>
                    <td>{t.transaction_date}</td>
                    <td>
                      <Badge value={t.type} />
                    </td>
                    <td>{t.description}</td>
                    <td>{money(String(t.amount))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Projects">
        {w.projects
          .filter((p) =>
            w.projectDepartments.some(
              (pd) => pd.project_id === p.id && pd.department_id === id,
            ),
          )
          .map((p) => (
            <p key={p.id}>
              <Link className="text-link" href={`/projects/${p.id}`}>
                {p.name} ↗
              </Link>
            </p>
          ))}
      </Panel>
      <Panel title="Discrepancies">
        {w.issues
          .filter((i) => i.department_id === id)
          .map((i) => (
            <div className="issue-row" key={i.id}>
              <Badge value={i.severity} />
              <p>{i.description}</p>
              <Badge value={i.status} />
            </div>
          ))}
      </Panel>
    </>
  );
}
