import { requireAdminPage } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { money } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { requestTypeSummaries } from "@/lib/request-reports";
import { decisionLabel } from "@/lib/request-decisions";
import { PageHeader, Panel } from "@/components/ui";
import { RequestReportExport } from "@/components/request-report-export";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await workspace(p.year, [
    "departments",
    "requests",
    "requestTypes",
  ]);
  const groups = requestTypeSummaries(w.requests, w.requestTypes);
  const department = (id: string) =>
    w.departments.find((d) => d.id === id)?.code ?? "Archived department";
  const status = (r: (typeof w.requests)[number]) =>
    decisionLabel(r.status) ||
    (r.status === "CANCELLED" ? "Withdrawn" : "Awaiting decision");
  const rows = [
    [
      "Academic year",
      "Request type",
      "Reference",
      "Request",
      "Department",
      "Amount (PHP)",
      "Decision",
      "Submitted",
      "Updated",
      "Requirements folder",
    ],
    ...groups.flatMap((group) =>
      group.records.map((r) => [
        w.year.label,
        requestTypeLabel(group.type),
        r.reference_code ?? "",
        r.title,
        department(r.department_id),
        String(r.amount),
        status(r),
        r.submitted_at ?? r.created_at,
        r.updated_at ?? r.created_at,
        r.source_folder_url ?? "",
      ]),
    ),
  ];
  return (
    <>
      <PageHeader
        title="Request Summaries"
        description={w.year.label}
        action={<RequestReportExport rows={rows} year={w.year.code} />}
      />
      <Panel
        title="By Request Type"
        subtitle="Submitted requests and their latest decisions. Amounts are requested amounts, not actual expenses."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request Type</th>
                <th>Requests</th>
                <th>Requested Amount</th>
                <th>Awaiting Decision</th>
                <th>Approved</th>
                <th>Rejected</th>
                <th>Incomplete</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.type.id}>
                  <td>{requestTypeLabel(group.type)}</td>
                  <td>{group.count}</td>
                  <td className="money-cell">{money(group.amount)}</td>
                  <td>{group.pending}</td>
                  <td>{group.approved}</td>
                  <td>{group.rejected}</td>
                  <td>{group.incomplete}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
