import { requireAdminPage } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { RequestTable } from "@/components/request-table";

export default async function Approvals({ searchParams }: { searchParams: Promise<{ year?: string; status?: string; notice?: string }> }) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await workspace(p.year, ["requests", "departments", "requestTypes"]);
  return <>
    <PageHeader title="Approvals" />
    {p.notice === "delivery-warning" && <p className="alert" role="status">Decision saved. An email or Sheets update is pending. Check the ticket's notification delivery history.</p>}
    <RequestTable requests={w.requests} departments={w.departments} types={w.requestTypes}
      finance queue="decisions" yearId={w.year.id} initialStatus={p.status} readOnly />
  </>;
}
