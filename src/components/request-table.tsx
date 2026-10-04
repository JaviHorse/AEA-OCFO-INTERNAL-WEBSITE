import Link from "next/link";
import type { FinanceRequest, Department, RequestType } from "@/lib/types";
import { money } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { Badge, Empty } from "./ui";
import { requestDecision, isRequestInbox } from "@/lib/request-decisions";
export function RequestTable({
  requests,
  departments,
  types,
  yearId,
  finance = false,
  queue = "all",
  filteredEmpty = false,
}: {
  requests: FinanceRequest[];
  departments: Department[];
  types: RequestType[];
  yearId?: string;
  finance?: boolean;
  queue?: "all" | "inbox" | "decisions";
  filteredEmpty?: boolean;
}) {
  const rows = requests.filter((r) =>
    queue === "inbox"
      ? isRequestInbox(r.status)
      : queue === "decisions"
        ? !!requestDecision(r.status)
        : true,
  );
  const date = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString("en-PH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Manila",
        })
      : "Not submitted";
  return (
    <>
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
                      {queue !== "inbox" && (
                        <td>
                          {requestDecision(r.status) ? (
                            <Badge value={requestDecision(r.status)!} />
                          ) : (
                            <span className="muted">
                              {r.status === "DRAFT"
                                ? "Draft"
                                : r.status === "CANCELLED"
                                  ? "Cancelled"
                                  : "Awaiting decision"}
                            </span>
                          )}
                        </td>
                      )}
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
        </>
      ) : (
        <Empty
          title={
            filteredEmpty
              ? "No matching requests"
              : queue === "decisions" && !requests.length
                ? "No decisions yet."
                : requests.length
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
