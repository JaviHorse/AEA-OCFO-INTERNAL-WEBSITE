import Link from "next/link";
import {
  Plus,
  ArrowUpRight,
  Wallet,
  ArrowDownLeft,
  Layers,
  TrendingUp,
  ShieldCheck,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import { workspace } from "@/lib/data";
import { cents, money, isFinance } from "@/lib/finance";
import { PageHeader, Panel, Empty } from "@/components/ui";
import { RequestTable } from "@/components/request-table";
import { DepartmentFilter } from "@/components/filters";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; department?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  const f = w.financials.filter(
    (f) => !p.department || f.department_id === p.department,
  );
  const requests = w.requests.filter(
    (r) => !p.department || r.department_id === p.department,
  );
  const issues = w.issues.filter(
    (i) =>
      i.status === "OPEN" &&
      (!p.department || i.department_id === p.department),
  );
  const sum = (
    key:
      | "current_budget"
      | "actual_expenses"
      | "actual_revenue"
      | "active_commitments"
      | "available_funds",
  ) => f.reduce((n, row) => n + cents(row[key]), 0n);
  const budget = sum("current_budget"),
    expenses = sum("actual_expenses"),
    committed = sum("active_commitments"),
    available = sum("available_funds");
  const utilization =
    budget > 0n ? Number((expenses * 1000n) / budget) / 10 : 0;
  const finance = w.yearRole && isFinance(w.yearRole);
  const queue = [
    [
      "Awaiting review",
      requests.filter((r) =>
        ["SUBMITTED", "UNDER_OCFO_REVIEW"].includes(r.status),
      ).length,
      Clock3,
    ],
    [
      "Ready for CFO",
      requests.filter((r) => r.status === "READY_FOR_CFO").length,
      ShieldCheck,
    ],
    [
      "Needs revision",
      requests.filter((r) => r.status === "NEEDS_REVISION").length,
      FileIcon,
    ],
    [
      "Processing",
      requests.filter((r) => r.status === "PROCESSING").length,
      Layers,
    ],
  ] as const;
  const metrics = [
    ["Approved budget", budget, "Current allocation", Wallet],
    [
      "Actual expenses",
      expenses,
      "Recorded expense transactions",
      ArrowDownLeft,
    ],
    ["Committed funds", committed, "Approved, awaiting realization", Layers],
    [
      "Available funds",
      available,
      "Budget − expenses − commitments",
      TrendingUp,
    ],
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow={`${w.year.label} / ${finance ? "ORGANIZATION OVERVIEW" : "DEPARTMENT OVERVIEW"}`}
        title="A clearer view of your finances."
        description="Every allocation, commitment, and decision. All in one place."
        action={
          !w.readOnly ? (
            <Link
              className="button primary"
              href={`/requests/new?year=${w.year.id}`}
            >
              <Plus size={17} />
              New request
            </Link>
          ) : undefined
        }
      />
      <div className="overview-toolbar">
        <span>
          <span className="live-dot" />{" "}
          {w.year.is_active ? "Current fiscal year" : "Historical fiscal year"}{" "}
          <span className="toolbar-separator">·</span> {w.year.label}
        </span>
        <DepartmentFilter departments={w.departments} />
      </div>
      {issues.some((i) => i.severity === "CRITICAL") && (
        <Link href={`/reports?year=${w.year.id}`} className="alert critical">
          <AlertTriangle size={18} />
          <span>
            <strong>
              {issues.filter((i) => i.severity === "CRITICAL").length} critical
              discrepancies need attention.
            </strong>{" "}
            Review reconciliation before making financial decisions.
          </span>
          <ArrowUpRight size={18} />
        </Link>
      )}
      <div className="metrics-grid">
        {metrics.map(([label, value, note, Icon], i) => (
          <div
            className={`metric-card ${i === 3 ? "highlight" : ""}`}
            key={label}
          >
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon">
                <Icon size={18} />
              </span>
            </div>
            <strong>{money(value)}</strong>
            <small>{note}</small>
            {i === 3 && <span className="metric-decoration" />}
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        <Panel
          title="Budget at a glance"
          subtitle="How your approved allocation is being used"
          action={
            <span className="soft-label">
              {w.year.code.slice(0, 2)}–{w.year.code.slice(2)}
            </span>
          }
        >
          <div className="budget-viz">
            <div
              className="donut"
              style={{
                background: `conic-gradient(var(--green) 0 ${Math.min(utilization, 100)}%, #b7cdbb ${Math.min(utilization, 100)}% ${Math.min(100, budget > 0n ? Number(((expenses + committed) * 1000n) / budget) / 10 : 0)}%, #eef1ea 0 100%)`,
              }}
            >
              <div>
                <strong>
                  {utilization.toFixed(1)}
                  <span>%</span>
                </strong>
                <small>UTILIZED</small>
              </div>
            </div>
            <div className="budget-legend">
              <div>
                <span>
                  <i className="legend-dot expense" />
                  Actual expenses
                </span>
                <strong>{money(expenses)}</strong>
              </div>
              <div>
                <span>
                  <i className="legend-dot commitment" />
                  Committed funds
                </span>
                <strong>{money(committed)}</strong>
              </div>
              <div>
                <span>
                  <i className="legend-dot remaining" />
                  Available funds
                </span>
                <strong>{money(available)}</strong>
              </div>
              <div className="legend-revenue">
                <span>Revenue recorded</span>
                <strong>{money(sum("actual_revenue"))}</strong>
              </div>
            </div>
          </div>
        </Panel>
        <Panel
          title="Keep things moving"
          subtitle="Your requests, at each step of the process"
        >
          <div className="queue-grid">
            {queue.map(([title, count, Icon]) => (
              <Link
                href={`/requests?year=${w.year.id}`}
                className="queue-card"
                key={title}
              >
                <Icon size={18} />
                <strong>{count.toString().padStart(2, "0")}</strong>
                <span>
                  {title}
                  <ArrowUpRight size={13} />
                </span>
              </Link>
            ))}
          </div>
          <div className="queue-note">
            <ShieldCheck size={15} />
            {
              issues.filter((i) => i.code.startsWith("MISSING_DOCUMENT")).length
            }{" "}
            missing-document issues ·{" "}
            {f.filter((row) => cents(row.available_funds) < 0n).length}{" "}
            over-budget departments
          </div>
        </Panel>
      </div>
      <Panel
        title="Department financial health"
        subtitle="Department budgets are the source of truth"
        action={
          <Link className="text-link" href={`/departments?year=${w.year.id}`}>
            View departments <ArrowUpRight size={14} />
          </Link>
        }
      >
        {f.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Approved budget</th>
                  <th>Actual expenses</th>
                  <th>Commitments</th>
                  <th>Available</th>
                  <th>Utilization</th>
                </tr>
              </thead>
              <tbody>
                {f.map((row) => {
                  const dept = w.departments.find(
                    (d) => d.id === row.department_id,
                  );
                  const percent =
                    cents(row.current_budget) > 0n
                      ? Number(
                          (cents(row.actual_expenses) * 1000n) /
                            cents(row.current_budget),
                        ) / 10
                      : 0;
                  return (
                    <tr key={row.department_id}>
                      <td>
                        <Link
                          className="department-cell"
                          href={`/departments/${row.department_id}?year=${w.year.id}`}
                        >
                          <span className="dept-avatar">
                            {dept?.code.slice(0, 2)}
                          </span>
                          <span>
                            <strong>{dept?.code}</strong>
                            <small>{dept?.name}</small>
                          </span>
                        </Link>
                      </td>
                      <td className="money-cell">
                        {money(row.current_budget)}
                      </td>
                      <td>{money(row.actual_expenses)}</td>
                      <td>{money(row.active_commitments)}</td>
                      <td
                        className={
                          cents(row.available_funds) < 0n
                            ? "error-text"
                            : "positive"
                        }
                      >
                        {money(row.available_funds)}
                      </td>
                      <td>
                        <div className="utilization">
                          <div>
                            <i
                              style={{ width: `${Math.min(percent, 100)}%` }}
                            />
                          </div>
                          <span>{percent.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="A fresh financial year"
            description="Approved department allocations will appear here. Start with a budget request."
          />
        )}
      </Panel>
      <Panel
        title="Recent requests"
        subtitle="The latest activity across your workspace"
        action={
          <Link className="text-link" href={`/requests?year=${w.year.id}`}>
            View all requests <ArrowUpRight size={14} />
          </Link>
        }
      >
        <RequestTable
          requests={requests.slice(0, 5)}
          departments={w.departments}
          types={w.requestTypes}
          filters={false}
          yearId={w.year.id}
        />
      </Panel>
    </>
  );
}
function FileIcon(props: { size: number }) {
  return <Clock3 {...props} />;
}
