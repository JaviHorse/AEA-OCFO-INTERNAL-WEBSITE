import { requireAdminPage } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { workspace } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { cents, isFinance } from "@/lib/finance";
export default async function Departments({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    health?: string;
    department?: string;
  }>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await workspace(p.year, ["departments", "financials"]);
  if ((!w.yearRole || !isFinance(w.yearRole)) && w.departments.length === 1)
    redirect(`/departments/${w.departments[0].id}?year=${w.year.id}`);
  const departments = w.departments.filter(
    (d) =>
      (!p.department || d.id === p.department) &&
      (p.health !== "over-budget" ||
        cents(
          w.financials.find((f) => f.department_id === d.id)?.available_funds ??
            "0",
        ) < 0n),
  );
  return (
    <>
      <PageHeader
        title="Departments"
        action={
          w.role === "CFO_ADMIN" && !w.readOnly ? (
            <Link className="button primary" href="/admin?tab=departments">
              Manage Departments
            </Link>
          ) : undefined
        }
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Department</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td>
                  <strong>{d.code}</strong>
                  <span className="cell-sub">{d.name}</span>
                </td>
                <td>{d.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <Link
                    className="text-link"
                    href={`/departments/${d.id}?year=${w.year.id}`}
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!departments.length && <p>No departments match this view.</p>}
      </div>
    </>
  );
}
