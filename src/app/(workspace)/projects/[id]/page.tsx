import { notFound } from "next/navigation";
import { session } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { money } from "@/lib/finance";
import { PageHeader, Panel, Badge } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
export default async function ProjectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await session();
  const { data: p } = await s.db
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const w = await workspace(p.fiscal_year_id);
  const [{ data: members }, { data: reports }] = await Promise.all([
    w.db.from("project_members").select("*").eq("project_id", id),
    w.db.from("project_reports").select("*").eq("project_id", id),
  ]);
  return (
    <>
      <PageHeader
        title={p.name}
        description={
          p.description ?? "Project financial activity by charged department."
        }
      />
      <Panel title="Project overview">
        <Badge value={p.status} />
        <p>
          {p.start_date ?? "—"} to {p.end_date ?? "—"}
        </p>
        <p>
          Participating departments:{" "}
          {w.projectDepartments
            .filter((pd) => pd.project_id === id)
            .map(
              (pd) =>
                w.departments.find((d) => d.id === pd.department_id)?.code,
            )
            .join(" · ")}
        </p>
        <p>
          Members:{" "}
          {members?.map((m) => m.user_id).join(", ") || "No assigned members"}
        </p>
        <p className="muted">
          This project has no independent budget. Each request charges its
          department.
        </p>
      </Panel>
      <Panel title="Linked requests">
        <RequestTable
          requests={w.requests.filter((r) => r.project_id === id)}
          departments={w.departments}
          types={w.requestTypes}
          filters={false}
        />
      </Panel>
      {w.departments
        .filter((d) =>
          w.projectDepartments.some(
            (pd) => pd.project_id === id && pd.department_id === d.id,
          ),
        )
        .map((d) => (
          <Panel title={`${d.code} · charged transactions`} key={d.id}>
            {w.transactions
              .filter((t) => t.project_id === id && t.department_id === d.id)
              .map((t) => (
                <p key={t.id}>
                  {t.transaction_date} · {t.type} · {money(String(t.amount))} ·{" "}
                  {t.description}
                </p>
              ))}
          </Panel>
        ))}
      <Panel title="Project-end reports">
        {reports?.length ? (
          reports.map((r) => (
            <p key={r.id}>
              <Badge value={r.status} /> Expenses{" "}
              {money(String(r.total_expenses))} · Revenue{" "}
              {money(String(r.total_revenue))} · Variance{" "}
              {money(String(r.variance))}
            </p>
          ))
        ) : (
          <p className="muted">
            No project-end report submitted. Submit one from Reports.
          </p>
        )}
      </Panel>
    </>
  );
}
