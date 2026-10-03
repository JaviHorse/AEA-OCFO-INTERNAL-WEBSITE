"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type {
  FinanceRequest,
  Department,
  RequestType,
  Project,
} from "@/lib/types";
import { money, human } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { Badge, Empty } from "./ui";
import { decisionStatuses, requestDecision, decisionLabel, isRequestInbox } from "@/lib/request-decisions";
export function RequestTable({
  requests,
  departments,
  types,
  projects = [],
  filters = true,
  yearId,
  finance = false,
  readOnly = false,
  initialStatus = "",
  initialType = "",
  initialDepartment = "",
  people = [],
  reviews = [],
  queue = "all",
}: {
  requests: FinanceRequest[];
  departments: Department[];
  types: RequestType[];
  projects?: Project[];
  filters?: boolean;
  yearId?: string;
  finance?: boolean;
  readOnly?: boolean;
  initialStatus?: string;
  initialType?: string;
  initialDepartment?: string;
  people?: { id: string; full_name: string | null; email: string }[];
  reviews?: { request_id: string; review_status: string }[];
  queue?: "all" | "inbox" | "decisions";
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [department, setDepartment] = useState(initialDepartment);
  const [type, setType] = useState(
    types.find((t) => t.id === initialType || t.code === initialType)?.id ??
      initialType,
  );
  const [project, setProject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [requester, setRequester] = useState("");
  const [page, setPage] = useState(1);
  const filtered = requests.filter((r) => {
    if (queue === "inbox" && !isRequestInbox(r.status)) return false;
    if (queue === "decisions" && !requestDecision(r.status)) return false;
    const person = people.find((p) => p.id === r.requester_user_id);
    return (
      `${r.reference_code ?? "Draft"} ${r.title}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status ||
        (status === "pending"
          ? [
              "SUBMITTED",
              "UNDER_OCFO_REVIEW",
              "READY_FOR_CFO",
              "APPROVED",
              "PROCESSING",
            ].includes(r.status)
          : status === "action"
            ? (finance
                ? ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"]
                : ["DRAFT", "NEEDS_REVISION"]
              ).includes(r.status)
            : (queue === "inbox" || status === "DRAFT" ? r.status : requestDecision(r.status)) === status)) &&
      (!department || r.department_id === department) &&
      (!type ||
        r.request_type_id === type ||
        types.find((t) => t.id === r.request_type_id)?.code === type ||
        (type === "DISBURSEMENTS" &&
          types
            .find((t) => t.id === r.request_type_id)
            ?.code.startsWith("DISBURSEMENT"))) &&
      (!project || r.project_id === project) &&
      (!requester ||
        `${person?.full_name ?? ""} ${person?.email ?? ""}`
          .toLowerCase()
          .includes(requester.toLowerCase())) &&
      (!from || (r.submitted_at ?? r.created_at).slice(0, 10) >= from) &&
      (!to || (r.submitted_at ?? r.created_at).slice(0, 10) <= to)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount);
  const rows = filters
    ? filtered.slice((currentPage - 1) * 25, currentPage * 25)
    : filtered;
  const date = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Manila",
        })
      : "Not submitted";
  const changed = (fn: () => void) => {
    fn();
    setPage(1);
  };
  const activeFilters = !!(
    query ||
    status ||
    department ||
    type ||
    project ||
    requester ||
    from ||
    to
  );
  return (
    <>
      {filters && (
        <>
          <div className="table-filters">
            <label className="search-field">
              <Search size={17} />
              <input
                placeholder="Search requests"
                aria-label="Search requests"
                value={query}
                onChange={(e) => changed(() => setQuery(e.target.value))}
              />
            </label>
            {queue !== "inbox" && <label>
              Status
              <select
                aria-label="Status"
                value={status}
                onChange={(e) => changed(() => setStatus(e.target.value))}
              >
                <option value="">All statuses</option>
                {queue === "all" && <option value="action">Needs Action</option>}
                {queue === "all" && !finance && <option value="pending">Pending</option>}
                {queue === "all" && <option value="DRAFT">Drafts</option>}
                {decisionStatuses.map((s) => (
                  <option key={s} value={s}>
                    {decisionLabel(s)}
                  </option>
                ))}
              </select>
            </label>}
            {finance && (
              <label>
                Department
                <select
                  aria-label="Department"
                  value={department}
                  onChange={(e) => changed(() => setDepartment(e.target.value))}
                >
                  <option value="">All accessible departments</option>
                  {departments.map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {finance && (
              <>
                <label>
                  Request type
                  <select
                    aria-label="Request type"
                    value={type}
                    onChange={(e) => changed(() => setType(e.target.value))}
                  >
                    <option value="">All types</option>
                    <option value="DISBURSEMENTS">Disbursements</option>
                    {types.map((t) => (
                      <option value={t.id} key={t.id}>
                        {requestTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {!finance && (
              <>
                <label>
                  Project
                  <select
                    aria-label="Project"
                    value={project}
                    onChange={(e) => changed(() => setProject(e.target.value))}
                  >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <details className="more-filters">
              <summary>More filters</summary>
              <div>
                {finance && (
                  <>
                    <label>
                      Project
                      <select
                        aria-label="Project"
                        value={project}
                        onChange={(e) =>
                          changed(() => setProject(e.target.value))
                        }
                      >
                        <option value="">All projects</option>
                        {projects.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label>
                  Submitted from
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => changed(() => setFrom(e.target.value))}
                  />
                </label>
                <label>
                  Submitted to
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => changed(() => setTo(e.target.value))}
                  />
                </label>
                {finance && (
                  <label>
                    Requester name or email
                    <input
                      value={requester}
                      onChange={(e) =>
                        changed(() => setRequester(e.target.value))
                      }
                    />
                  </label>
                )}
              </div>
            </details>
            {activeFilters && (
              <button
                className="button secondary"
                onClick={() =>
                  changed(() => {
                    setQuery("");
                    setStatus("");
                    setDepartment("");
                    setType("");
                    setProject("");
                    setFrom("");
                    setTo("");
                    setRequester("");
                  })
                }
              >
                Clear filters
              </button>
            )}
          </div>
        </>
      )}
      {rows.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  {finance && <th>Department</th>}
                  <th>{finance ? "Type" : "Request"}</th>
                  <th>Amount</th>
                  {queue !== "inbox" && <th>Status</th>}
                  <th>{finance ? "Submitted" : "Updated"}</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = `/requests/${r.id}?year=${yearId ?? r.fiscal_year_id}`;
                  const person = people.find(
                    (p) => p.id === r.requester_user_id,
                  );
                  const type = types.find((t) => t.id === r.request_type_id);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link className="request-title" href={href}>
                          {r.reference_code ?? "Draft"}
                        </Link>
                      </td>
                      {finance && (
                        <td>
                          <span className="dept-tag">
                            {
                              departments.find((d) => d.id === r.department_id)
                                ?.code
                            }
                          </span>
                        </td>
                      )}
                      <td>
                        {finance
                          ? type
                            ? requestTypeLabel(type)
                            : "Finance Request"
                          : r.title}
                      </td>
                      <td className="money-cell">{money(r.amount)}</td>
                      {queue !== "inbox" && <td>
                        {requestDecision(r.status) ? <Badge value={requestDecision(r.status)!} /> : <span className="muted">{r.status === "DRAFT" ? "Draft" : r.status === "CANCELLED" ? "Cancelled" : "Awaiting decision"}</span>}
                      </td>}
                      <td>
                        {date(
                          finance
                            ? r.submitted_at
                            : (r.updated_at ?? r.created_at),
                        )}
                      </td>
                      <td>
                        <Link className="text-link" href={href}>
                          {finance && queue !== "decisions" ? "Review" : "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filters && pageCount > 1 && (
            <div className="pagination">
              <span>
                {filtered.length} requests · Page {currentPage} of {pageCount}
              </span>
              <button
                className="button secondary"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                className="button secondary"
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <Empty
          title={
            queue === "decisions" && !requests.length ? "No decisions yet." : requests.length
              ? "No matching requests"
              : "No finance requests yet."
          }
          description={
            requests.length
              ? "Try adjusting your search or filters."
              : "Submitted requests appear here."
          }
          label="File New Request"
        />
      )}
    </>
  );
}
