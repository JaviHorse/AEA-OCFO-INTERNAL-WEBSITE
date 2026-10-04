import { requireAdminPage } from "@/lib/auth";
import { getRequestListData, type RequestFilters } from "@/lib/page-data";
import { hasRequestFilters } from "@/lib/request-filters";
import { RequestListControls } from "@/components/request-list-controls";
import { PageHeader } from "@/components/ui";
import { RequestTable } from "@/components/request-table";

export default async function Approvals({
  searchParams,
}: {
  searchParams: Promise<RequestFilters>;
}) {
  await requireAdminPage();
  const p = await searchParams;
  const w = await getRequestListData(p, "decisions");
  return (
    <>
      <PageHeader title="Approvals" />
      {p.notice === "delivery-warning" && (
        <p className="alert" role="status">
          Decision saved. An email or Sheets update is pending. Check the
          ticket&apos;s notification delivery history.
        </p>
      )}
      <RequestListControls
        key={JSON.stringify(p)}
        params={{ ...p, year: w.year.id }}
        departments={w.departments}
        types={w.requestTypes}
        projects={w.projects}
        finance
        count={w.count}
        page={w.page}
        queue="decisions"
      />
      <RequestTable
        filteredEmpty={hasRequestFilters(p)}

        requests={w.requests}
        departments={w.departments}
        types={w.requestTypes}
        finance
        queue="decisions"
        yearId={w.year.id}
      />
    </>
  );
}
