import Link from "next/link";
import { Plus } from "lucide-react";
import { getRequestListData, type RequestFilters } from "@/lib/page-data";
import { hasRequestFilters } from "@/lib/request-filters";
import { RequestListControls } from "@/components/request-list-controls";
import { PageHeader } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
import { registerUrl } from "@/lib/request-register";
import { isFinance } from "@/lib/finance";
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<RequestFilters>;
}) {
  const p = await searchParams;
  const w = await getRequestListData(p, "all");
  const finance = !!w.yearRole && isFinance(w.yearRole);
  return (
    <>
      <PageHeader
        title={finance ? "Finance Requests" : "Financial Requests"}
        action={
          !finance && !w.readOnly && w.yearRole === "DEPARTMENT_MEMBER" ? (
            <Link
              href={`/requests/new?year=${w.year.id}`}
              className="button primary"
            >
              <Plus size={16} />
              File New Request
            </Link>
          ) : finance ? (
            <a
              className="button secondary"
              href={registerUrl()}
              target="_blank"
              rel="noreferrer"
            >
              Open Finance Register
            </a>
          ) : undefined
        }
      />
      {p.notice === "admin-review-only" && (
        <p className="alert">
          Finance Administrator accounts review and manage requests. They cannot
          file requests.
        </p>
      )}
      <section className="request-list" aria-label="Requests">
        <RequestListControls
          key={JSON.stringify(p)}
          params={{ ...p, year: w.year.id }}
          departments={w.departments}
          types={w.requestTypes}
          projects={w.projects}
          finance={finance}
          count={w.count}
          page={w.page}
          queue={w.queue}
        />
        <RequestTable
          filteredEmpty={hasRequestFilters(p)}
          filters={false}
          key={`${p.status ?? ""}-${p.department ?? ""}-${p.type ?? ""}-${w.year.id}`}
          requests={w.requests}
          queue={finance ? "inbox" : "all"}
          departments={w.departments}
          types={w.requestTypes}
          projects={w.projects}
          yearId={w.year.id}
          finance={finance}
          readOnly={w.readOnly || w.yearRole !== "DEPARTMENT_MEMBER"}
        />
      </section>
    </>
  );
}
