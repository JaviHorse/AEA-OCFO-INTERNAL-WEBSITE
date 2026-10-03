import Link from "next/link";
import { workspace } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui";
import { money } from "@/lib/finance";
export default async function Departments({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  return (
    <>
      <PageHeader
        title="Departments"
        description="A shared view of allocations. Clear ownership of every peso."
      />
      <div className="department-grid">
        {w.departments.map((d) => {
          const f = w.financials.find((f) => f.department_id === d.id);
          return (
            <Panel key={d.id} title={d.code} subtitle={d.name}>
              <dl className="detail-list">
                <div>
                  <dt>Approved budget</dt>
                  <dd>{money(f?.current_budget ?? "0")}</dd>
                </div>
                <div>
                  <dt>Expenses</dt>
                  <dd>{money(f?.actual_expenses ?? "0")}</dd>
                </div>
                <div>
                  <dt>Commitments</dt>
                  <dd>{money(f?.active_commitments ?? "0")}</dd>
                </div>
                <div>
                  <dt>Available</dt>
                  <dd className="positive">
                    {money(f?.available_funds ?? "0")}
                  </dd>
                </div>
              </dl>
              <Link
                className="text-link"
                href={`/departments/${d.id}?year=${w.year.id}`}
              >
                View department ↗
              </Link>
            </Panel>
          );
        })}
      </div>
    </>
  );
}
