"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import type {
  FinanceRequest,
  Department,
  RequestType,
  Project,
} from "@/lib/types";
import { statuses } from "@/lib/types";
import { money, human } from "@/lib/finance";
import { Badge, Empty } from "./ui";
export function RequestTable({
  requests,
  departments,
  types,
  projects = [],
  filters = true,
  yearId,
}: {
  requests: FinanceRequest[];
  departments: Department[];
  types: RequestType[];
  projects?: Project[];
  filters?: boolean;
  yearId?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [type, setType] = useState("");
  const [project, setProject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [requester, setRequester] = useState("");
  const filtered = requests.filter(
    (r) =>
      `${r.reference_code ?? "Draft"} ${r.title}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!status || r.status === status) &&
      (!department || r.department_id === department) &&
      (!type || r.request_type_id === type) &&
      (!project || r.project_id === project) &&
      (!requester || r.requester_user_id.includes(requester)) &&
      (!from || r.created_at.slice(0, 10) >= from) &&
      (!to || r.created_at.slice(0, 10) <= to),
  );
  return (
    <>
      {filters && (
        <div className="table-filters">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Search reference or title…"
              aria-label="Search requests"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option value={d.id} key={d.id}>
                {d.code}
              </option>
            ))}
          </select>
          <select
            aria-label="Request type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <details className="more-filters">
            <summary>More filters</summary>
            <div>
              <label>
                Project
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label>
                Requester ID
                <input
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                />
              </label>
            </div>
          </details>
        </div>
      )}
      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>Department</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      className="request-title"
                      href={`/requests/${r.id}${yearId ? `?year=${yearId}` : ""}`}
                    >
                      {r.title}
                    </Link>
                    <span className="cell-sub">
                      {r.reference_code ??
                        "Draft · Reference assigned on submit"}
                    </span>
                  </td>
                  <td>
                    <span className="dept-tag">
                      {departments.find((d) => d.id === r.department_id)?.code}
                    </span>
                  </td>
                  <td>
                    {types.find((t) => t.id === r.request_type_id)?.name ??
                      human(r.request_type_id)}
                  </td>
                  <td className="money-cell">{money(r.amount)}</td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                  <td className="muted">
                    {new Date(
                      r.submitted_at ?? r.created_at,
                    ).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                  <td>
                    <Link
                      href={`/requests/${r.id}`}
                      aria-label={`View ${r.title}`}
                    >
                      <ArrowUpRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={
            requests.length
              ? "No matching requests"
              : "Your next request starts here"
          }
          description={
            requests.length
              ? "Try adjusting your search or filters."
              : "Create a draft, gather your documents, and let your team take it from there."
          }
          href="/requests/new"
          label="Create a request"
        />
      )}
    </>
  );
}
