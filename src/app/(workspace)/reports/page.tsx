import { requireAdminPage } from "@/lib/auth";
import { getReportData } from "@/lib/page-data";
import { money } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { PageHeader, Panel } from "@/components/ui";

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await getReportData(p.year);
  const groups = w.groups;
  return (
    <>
      <PageHeader
        title="Request Summaries"
        description={w.year.label}
        action={
          <a
            className="button secondary"
            href={`/reports/export?year=${w.year.id}`}
          >
            Download Compilation
          </a>
        }
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
