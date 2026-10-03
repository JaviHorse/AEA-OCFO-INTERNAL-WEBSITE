"use client";
import { useState } from "react";
import Link from "next/link";
import type {
  Transaction,
  Department,
  Project,
  FinanceRequest,
} from "@/lib/types";
import { money } from "@/lib/finance";
import { Badge, Empty } from "./ui";
import { VerifyRecord } from "./verify-record";
export function TransactionLedger({
  transactions,
  departments,
  projects,
  requests,
  canVerify = false,
}: {
  transactions: Transaction[];
  departments: Department[];
  projects: Project[];
  requests: FinanceRequest[];
  canVerify?: boolean;
}) {
  const [department, setDepartment] = useState("");
  const [type, setType] = useState("");
  const [project, setProject] = useState("");
  const [request, setRequest] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = transactions.filter(
    (t) =>
      (!department || t.department_id === department) &&
      (!type || t.type === type) &&
      (!project || t.project_id === project) &&
      (!request || t.request_id === request) &&
      (!from || t.transaction_date >= from) &&
      (!to || t.transaction_date <= to),
  );
  return (
    <>
      <div className="table-filters">
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
          aria-label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Expenses and revenue</option>
          <option>EXPENSE</option>
          <option>REVENUE</option>
        </select>
        <select
          aria-label="Project"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Request"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        >
          <option value="">All requests</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.reference_code ?? r.title}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      {filtered.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Department</th>
                <th>Description</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Request</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td>
                  <td>
                    <span className="dept-tag">
                      {departments.find((d) => d.id === t.department_id)?.code}
                    </span>
                  </td>
                  <td>{t.description}</td>
                  <td>
                    <Badge value={t.type} />
                  </td>
                  <td className="money-cell">{money(String(t.amount))}</td>
                  <td>
                    {t.request_id ? (
                      <Link
                        className="text-link"
                        href={`/requests/${t.request_id}`}
                      >
                        {requests.find((r) => r.id === t.request_id)
                          ?.reference_code ?? "View request"}{" "}
                        ↗
                      </Link>
                    ) : (
                      "Unlinked"
                    )}
                  </td>
                  <td>
                    {t.verified_by ? (
                      <Badge value="VERIFIED" />
                    ) : canVerify ? (
                      <VerifyRecord kind="transaction" id={t.id} />
                    ) : (
                      <Badge value="PENDING" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No transactions yet"
          description="Recorded expenses and revenue appear here separately, with links back to their approved requests."
        />
      )}
    </>
  );
}
