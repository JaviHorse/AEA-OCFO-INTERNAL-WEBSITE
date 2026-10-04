"use client";
import { useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Department, Project, RequestType } from "@/lib/types";
import { human } from "@/lib/finance";
import { requestQueryKeys, type RequestFilters } from "@/lib/request-filters";
import { requestTypeLabel } from "@/lib/ux";
export function RequestListControls({
  params,
  departments,
  types,
  projects,
  finance,
  count,
  page,
  queue,
}: {
  params: RequestFilters;
  departments: Department[];
  types: RequestType[];
  projects: Project[];
  finance: boolean;
  count: number;
  page: number;
  queue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const pages = Math.max(1, Math.ceil(count / 25));
  const href = (next: number) => {
    const q = new URLSearchParams();
    for (const key of requestQueryKeys) {
      const value = params[key];
      if (value && key !== "page") q.set(key, value);
    }
    q.set("page", String(next));
    return `${pathname}?${q}`;
  };
  return (
    <>
      <form
        className="table-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new URLSearchParams();
          for (const [k, v] of new FormData(e.currentTarget))
            if (String(v)) q.set(k, String(v));
          start(() => router.push(`${pathname}?${q}`));
        }}
      >
        <input type="hidden" name="year" value={params.year ?? ""} />
        <label>
          Status
          <select
            aria-label="Status"
            name="status"
            defaultValue={params.status ?? ""}
          >
            <option value="">All statuses</option>
            {(queue === "inbox"
              ? ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"]
              : queue === "decisions"
                ? ["APPROVED", "REJECTED", "NEEDS_REVISION"]
                : [
                    "DRAFT",
                    "pending",
                    "action",
                    "APPROVED",
                    "REJECTED",
                    "NEEDS_REVISION",
                    "CANCELLED",
                  ]
            ).map((s) => (
              <option key={s} value={s}>
                {s === "NEEDS_REVISION" ? "Incomplete" : human(s)}
              </option>
            ))}
          </select>
        </label>
        {finance && (
          <label>
            Department
            <select name="department" defaultValue={params.department ?? ""}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Request type
          <select name="type" defaultValue={params.type ?? ""}>
            <option value="">All types</option>
            <option value="DISBURSEMENTS">Disbursements</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {requestTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        {finance && (
          <label>
            Project
            <select name="project" defaultValue={params.project ?? ""}>
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="button secondary" disabled={pending}>
          {pending ? "Loading..." : "Apply filters"}
        </button>
        <Link
          className="text-link"
          href={`${pathname}?year=${params.year ?? ""}`}
        >
          Clear filters
        </Link>
      </form>
      <nav className="pagination" aria-label="Request pages">
        <span role="status">
          {pending
            ? "Loading requests..."
            : `${count} requests - Page ${page} of ${pages}`}
        </span>
        {page > 1 && (
          <Link className="button secondary" href={href(page - 1)}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link className="button secondary" href={href(page + 1)}>
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
