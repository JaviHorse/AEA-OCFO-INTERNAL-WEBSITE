import { workspace } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { driveClient } from "@/lib/google-drive";
import { redirect } from "next/navigation";
export default async function NewRequest({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  if (w.readOnly) redirect(`/requests?year=${w.year.id}`);
  let email = "";
  try {
    email = (await driveClient()).email;
  } catch {
    /* A server-side validation error will identify configuration problems. */
  }
  return (
    <>
      <PageHeader
        title="Start a new request."
        description={`${w.year.label} · A few details here. Your documents do the rest.`}
      />
      <RequestForm
        yearId={w.year.id}
        departments={w.departments.filter((d) => d.is_active)}
        types={w.requestTypes.filter((t) => t.is_active)}
        projects={w.projects}
        requirements={w.requirements}
        projectDepartments={w.projectDepartments}
        integrationEmail={email}
      />
    </>
  );
}
