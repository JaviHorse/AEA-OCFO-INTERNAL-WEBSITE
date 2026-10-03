import Link from "next/link";
import { Plus } from "lucide-react";
import { workspace } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
import { registerUrl } from "@/lib/request-register";
import { isFinance } from "@/lib/finance";
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    status?: string;
    department?: string;
    type?: string;
    notice?: string;
  }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year, [
    "departments",
    "requests",
    "requestTypes",
    "projects",
  ]);
  const finance = !!w.yearRole && isFinance(w.yearRole);
  const { data: people, error: peopleError } =
    finance && w.requests.length
      ? await w.db
          .from("users")
          .select("id,full_name,email")
          .in("id", [...new Set(w.requests.map((r) => r.requester_user_id))])
      : { data: [], error: null };
  if (peopleError) throw new Error("Requesters could not be loaded.");
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
          ) : finance ? <a className="button secondary" href={registerUrl()} target="_blank" rel="noreferrer">Open Finance Register</a> : undefined
        }
      />
      {p.notice === "admin-review-only" && (
        <p className="alert">
          Finance Administrator accounts review and manage requests. They cannot
          file requests.
        </p>
      )}
      <section className="request-list" aria-label="Requests">
        <RequestTable
          key={`${p.status ?? ""}-${p.department ?? ""}-${p.type ?? ""}-${w.year.id}`}
          requests={w.requests}
          queue={finance ? "inbox" : "all"}
          departments={w.departments}
          types={w.requestTypes}
          projects={w.projects}
          yearId={w.year.id}
          finance={finance}
          readOnly={w.readOnly || w.yearRole !== "DEPARTMENT_MEMBER"}
          initialStatus={p.status}
          initialType={p.type}
          initialDepartment={
            w.departments.some((d) => d.id === p.department)
              ? p.department
              : undefined
          }
          people={people ?? []}
        />
      </section>
    </>
  );
}
