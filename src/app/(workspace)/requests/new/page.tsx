import { workspace } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { driveClient } from "@/lib/google-drive";
import { redirect } from "next/navigation";
import { isAdmin, isRegisteredUser } from "@/lib/permissions";
import { session } from "@/lib/auth";
export default async function NewRequest({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; type?: string }>;
}) {
  const s = await session();
  if (isAdmin(s.role)) redirect("/requests?notice=admin-review-only");
  if (!isRegisteredUser(s.role)) redirect("/access-denied");
  const p = await searchParams;
  const w = await workspace(p.year, [
    "departments",
    "requestTypes",
    "projects",
    "requirements",
    "projectDepartments",
  ]);
  if (w.readOnly || !isRegisteredUser(w.yearRole))
    redirect(`/requests?year=${w.year.id}`);
  let email = "";
  try {
    email = (await driveClient()).email;
  } catch {
    /* A server-side validation error will identify configuration problems. */
  }
  return (
    <>
      <PageHeader title="File New Request" />
      <RequestForm
        yearId={w.year.id}
        departments={w.departments.filter((d) => d.is_active)}
        types={w.requestTypes.filter((t) => t.is_active)}
        projects={w.projects}
        requirements={w.requirements}
        projectDepartments={w.projectDepartments}
        integrationEmail={email}
        initialType={p.type}
        finance={false}
      />
    </>
  );
}
