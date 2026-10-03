import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { money } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { requestTypeSummaries } from "@/lib/request-reports";
import { decisionLabel } from "@/lib/request-decisions";
import { PageHeader, Panel } from "@/components/ui";
import { RequestReportExport } from "@/components/request-report-export";

export default async function Reports({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await workspace(p.year, ["departments", "requests", "requestTypes"]);
  const groups = requestTypeSummaries(w.requests, w.requestTypes);
  const department = (id: string) => w.departments.find(d => d.id === id)?.code ?? "Archived department";
  const status = (r: typeof w.requests[number]) => decisionLabel(r.status) || (r.status === "CANCELLED" ? "Withdrawn" : "Awaiting decision");
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) : "—";
  const rows = [["Academic year", "Request type", "Reference", "Request", "Department", "Amount (PHP)", "Decision", "Submitted", "Updated", "Requirements folder"],
    ...groups.flatMap(group => group.records.map(r => [w.year.label, requestTypeLabel(group.type), r.reference_code ?? "", r.title, department(r.department_id), String(r.amount), status(r), r.submitted_at ?? r.created_at, r.updated_at ?? r.created_at, r.source_folder_url ?? ""]))];
  return <>
    <PageHeader title="Request Summaries" description={w.year.label} action={<RequestReportExport rows={rows} year={w.year.code} />} />
    <Panel title="By Request Type" subtitle="Submitted requests and their latest decisions. Amounts are requested amounts, not actual expenses.">
      <div className="table-wrap"><table><thead><tr>
        <th>Request Type</th><th>Requests</th><th>Requested Amount</th><th>Awaiting Decision</th><th>Approved</th><th>Rejected</th><th>Incomplete</th>
      </tr></thead><tbody>{groups.map(group => <tr key={group.type.id}>
        <td><a className="text-link" href={`#type-${group.type.id}`}>{requestTypeLabel(group.type)}</a></td>
        <td>{group.count}</td><td className="money-cell">{money(group.amount)}</td><td>{group.pending}</td><td>{group.approved}</td><td>{group.rejected}</td><td>{group.incomplete}</td>
      </tr>)}</tbody></table></div>
    </Panel>
    {groups.map(group => <details key={group.type.id} id={`type-${group.type.id}`} className="help-disclosure">
      <summary>{requestTypeLabel(group.type)} · {group.count} requests · {money(group.amount)}</summary>
      <div className="disclosure-body">{group.records.length ? <div className="table-wrap"><table><thead><tr>
        <th>Reference</th><th>Request</th><th>Department</th><th>Amount</th><th>Decision</th><th>Submitted</th><th>Updated</th><th>Action</th>
      </tr></thead><tbody>{group.records.map(r => <tr key={r.id}>
        <td>{r.reference_code ?? "—"}</td><td>{r.title}</td><td>{department(r.department_id)}</td><td className="money-cell">{money(r.amount)}</td>
        <td>{status(r)}</td><td>{date(r.submitted_at ?? r.created_at)}</td><td>{date(r.updated_at ?? r.created_at)}</td>
        <td><Link className="text-link" href={`/requests/${r.id}?year=${w.year.id}`}>View Details</Link></td>
      </tr>)}</tbody></table></div> : <p className="muted">No submitted requests for this type.</p>}
      {group.withdrawn > 0 && <p className="muted">{group.withdrawn} withdrawn requests retained in this compilation.</p>}
      </div>
    </details>)}
  </>;
}
