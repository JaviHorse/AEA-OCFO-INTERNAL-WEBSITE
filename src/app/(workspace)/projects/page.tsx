import Link from "next/link";
import { workspace } from "@/lib/data";
import { PageHeader, Panel, Badge, Empty } from "@/components/ui";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  return (
    <>
      <PageHeader
        title="Projects"
        description="Connect your financial activity to the work it makes possible. Budgets stay with departments."
      />
      {w.projects.length ? (
        <div className="department-grid">
          {w.projects.map((pr) => (
            <Panel title={pr.name} subtitle={pr.description ?? ""} key={pr.id}>
              <Badge value={pr.status} />
              <p className="muted">
                {pr.start_date ?? "No start date"} —{" "}
                {pr.end_date ?? "No end date"}
              </p>
              <p>
                {w.projectDepartments
                  .filter((pd) => pd.project_id === pr.id)
                  .map(
                    (pd) =>
                      w.departments.find((d) => d.id === pd.department_id)
                        ?.code,
                  )
                  .join(" · ")}
              </p>
              <Link className="text-link" href={`/projects/${pr.id}`}>
                View project ↗
              </Link>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title="Project directory">
          <Empty
            title="Make room for your next project"
            description="CFO administrators can create projects and assign participating departments in Administration."
          />
        </Panel>
      )}
    </>
  );
}
