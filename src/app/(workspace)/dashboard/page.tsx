import Link from "next/link";
import { session } from "@/lib/auth";
import { workspace } from "@/lib/data";
import { cents, money, isFinance } from "@/lib/finance";
import { requestTypeLabel } from "@/lib/ux";
import { PageHeader, Panel } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
import { NeedsAttention } from "@/components/needs-attention";
import type { Financial } from "@/lib/types";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const s = await session();
  const w = await workspace(p.year, [
    "departments",
    "financials",
    "requests",
    "requestTypes",
    ...(isFinance(s.role) ? ["issues" as const] : []),
  ]);
  const admin = isFinance(w.role);
  const file = !admin && w.yearRole === "DEPARTMENT_MEMBER" && !w.readOnly;
  const requests = w.requests;
  const total = (
    key: keyof Pick<
      Financial,
      | "current_budget"
      | "actual_expenses"
      | "active_commitments"
      | "available_funds"
      | "actual_revenue"
    >,
  ) => w.financials.reduce((sum, f) => sum + cents(f[key]), 0n);
  const pending = requests.filter((r) =>
    [
      "SUBMITTED",
      "UNDER_OCFO_REVIEW",
      "READY_FOR_CFO",
      "APPROVED",
      "PROCESSING",
    ].includes(r.status),
  ).length;
  const revisions = requests.filter((r) => r.status === "NEEDS_REVISION");
  const query = `year=${w.year.id}`;
  const name = String(
    w.user.user_metadata.full_name ?? w.user.email?.split("@")[0] ?? "Member",
  ).split(" ")[0];
  const attention = w.readOnly
    ? []
    : revisions.map((r) => ({
        id: r.id,
        title: `${r.reference_code ?? r.title} · ${requestTypeLabel(w.requestTypes.find((t) => t.id === r.request_type_id) ?? { code: "", name: "Finance request" })}`,
        description:
          "Finance requested changes. Open the request to read the feedback and resubmit.",
        href: `/requests/${r.id}`,
        action: "Fix Request",
      }));
  if (!admin && attention.length) {
    const { data: comments, error } = await w.db
      .from("request_comments")
      .select("request_id,body,author_user_id,created_at")
      .in(
        "request_id",
        revisions.map((r) => r.id),
      )
      .eq("visibility", "REQUESTER_VISIBLE")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Finance messages could not be loaded.");
    for (const item of attention) {
      const latest = comments?.find(
        (c) => c.request_id === item.id && c.author_user_id !== w.user.id,
      );
      if (latest) item.description = latest.body;
    }
  }
  const metrics: [string, string | number][] = admin
    ? [
        ["Budget", money(total("current_budget"))],
        ["Spent", money(total("actual_expenses"))],
        ["Committed", money(total("active_commitments"))],
        ["Available", money(total("available_funds"))],
        ["Revenue", money(total("actual_revenue"))],
      ]
    : ([
        ["Available Budget", money(total("available_funds"))],
        ["Pending Requests", pending],
      ].filter(
        ([label, value]) => label === "Available Budget" || value !== 0,
      ) as [string, string | number][]);
  const queues: [string, number, string][] = [
    [
      "New Requests",
      requests.filter((r) => r.status === "SUBMITTED").length,
      `/requests?${query}&status=SUBMITTED`,
    ],
    [
      "For Approval",
      requests.filter((r) => r.status === "READY_FOR_CFO").length,
      `/requests?${query}&status=READY_FOR_CFO`,
    ],
    [
      "Incomplete",
      requests.filter(r => r.status === "NEEDS_REVISION").length,
      `/approvals?${query}&status=NEEDS_REVISION`,
    ],
  ];
  return (
    <>
      <PageHeader
        eyebrow={
          !admin ? w.departments.map((d) => d.code).join(" / ") : undefined
        }
        title={`Welcome back, ${name}${admin ? "." : "!"}`}
        action={
          file ? (
            <Link className="button primary" href={`/requests/new?${query}`}>
              + File New Request
            </Link>
          ) : undefined
        }
      />
      {admin && (
        <Panel title="To Review">
          <div className="attention-queues">
            {queues
              .filter(
                ([label, count]) => label !== "Finance Issues" || count > 0,
              )
              .map(([label, count, href]) => (
                <Link
                  key={label}
                  href={href}
                  className={`queue-card ${count === 0 ? "queue-empty" : ""}`}
                >
                  <strong>{count}</strong>
                  <span>{label} →</span>
                </Link>
              ))}
          </div>
        </Panel>
      )}
      {admin ? (
        <Panel title="Financial Summary">
          <div className="summary-grid">
            {metrics.map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      ) : (
        <div className="metrics-grid">
          {metrics.map(([label, value]) => (
            <div
              className={`metric-card ${label.startsWith("Available") ? "highlight" : ""}`}
              key={label}
            >
              <div className="metric-top">{label}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {!admin && (
        <>
          <NeedsAttention items={attention} />
          <details className="budget-explanation">
            <summary>How is my available budget calculated?</summary>
            <p>
              Current budget {money(total("current_budget"))}, minus expenses{" "}
              {money(total("actual_expenses"))} and committed funds{" "}
              {money(total("active_commitments"))}. Revenue is tracked
              separately.
            </p>
          </details>
        </>
      )}
      <Panel
        title="Recent Requests"
        action={
          <Link className="text-link" href={`/requests?${query}`}>
            View All Requests →
          </Link>
        }
      >
        <RequestTable
          requests={requests.slice(0, 5)}
          departments={w.departments}
          types={w.requestTypes}
          filters={false}
          finance={admin}
          yearId={w.year.id}
          readOnly={!file}
        />
      </Panel>
    </>
  );
}
