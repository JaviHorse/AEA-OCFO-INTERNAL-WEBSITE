import type { Status } from "@/lib/types";
import { decisionLabel, requestDecision } from "@/lib/request-decisions";

export function RequestStatusTimeline({ status }: { status: Status }) {
  const decision = requestDecision(status);
  const started = status !== "DRAFT";
  return <section className="status-progress" aria-label="Request progress"><ol>
    {["Submitted", "Finance Review", decisionLabel(status) || "Decision"].map((label, i) => {
      const done = !!decision || (started && i === 0);
      const current = !decision && started && status !== "CANCELLED" && i === 1;
      return <li key={i} className={done ? "done" : current ? "current" : ""} aria-current={current ? "step" : undefined}>
        <span aria-hidden="true">{done ? "✓" : current ? "●" : "○"}</span>
        <span>{label}<small className="sr-only">{done ? "Complete" : current ? "Current stage" : "Next"}</small></span>
      </li>;
    })}
  </ol></section>;
}
