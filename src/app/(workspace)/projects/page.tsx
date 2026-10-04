import Link from "next/link";
import { workspace } from "@/lib/data";
import { PageHeader, Panel, Badge, Empty } from "@/components/ui";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year, [
    "departments",
    "projects",
    "projectDepartments",
  ]);
  return (
    <>
      <PageHeader
        title="Projects"
        description={
          w.role === "DEPARTMENT_MEMBER"
            ? "Projects linked to your department."
            : "AEA projects."
        }
        action={
          w.role === "CFO_ADMIN" && !w.readOnly ? (
            <Link className="button primary" href="/admin?tab=projects">
              + Add Project
            </Link>
          ) : undefined
        }
      />
      {w.projects.length ? (
        <div className="department-grid">
          {w.projects.map((pr) => (
            <Panel title={pr.name} key={pr.id}>
              <Badge value={pr.status} />
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
                Open
              </Link>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title="Project directory">
          <Empty
            title="No projects are currently linked to your department."
            description="Ask Finance to link a project."
          />
        </Panel>
      )}
    </>
  );
}
