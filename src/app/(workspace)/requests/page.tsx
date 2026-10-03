import Link from "next/link";
import { Plus } from "lucide-react";
import { workspace } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
export default async function Requests({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  return (
    <>
      <PageHeader
        title="Requests"
        description="From draft to completion, keep every financial action traceable."
        action={
          !w.readOnly ? (
            <Link
              href={`/requests/new?year=${w.year.id}`}
              className="button primary"
            >
              <Plus size={16} />
              New request
            </Link>
          ) : undefined
        }
      />
      <Panel
        title="Request register"
        subtitle={`${w.requests.length} requests · ${w.year.label}`}
      >
        <RequestTable
          requests={w.requests}
          departments={w.departments}
          types={w.requestTypes}
          projects={w.projects}
          yearId={w.year.id}
        />
      </Panel>
    </>
  );
}
