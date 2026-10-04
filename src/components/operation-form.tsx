"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAction,
  recordTransaction,
  setDepartmentBudget,
  saveGuide,
  resolveIssue,
  submitReport,
  manageRegisteredUser,
  type ActionResult,
} from "@/app/actions";
import { ConfirmationDialog } from "./confirmation-dialog";
export function OperationForm({
  children,
  command,
  kind = "admin",
  defaults = {},
  label = "Save Changes",
  confirm = false,
}: {
  children: React.ReactNode;
  command?: string;
  kind?:
    | "admin"
    | "guide"
    | "resolve"
    | "report"
    | "member"
    | "transaction"
    | "budget";
  defaults?: Record<string, unknown>;
  label?: string;
  confirm?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmation, setConfirmation] = useState<{
    data: Record<string, unknown>;
  } | null>(null);
  const destructive = command === "CLOSE_YEAR" || kind === "resolve";
  function perform(data: Record<string, unknown>) {
    start(async () => {
      const r =
        kind === "transaction"
          ? await recordTransaction(data)
          : kind === "budget"
            ? await setDepartmentBudget(data)
            : kind === "member"
              ? await manageRegisteredUser(data)
              : kind === "admin"
                ? await adminAction(command!, data)
                : kind === "guide"
                  ? await saveGuide(data)
                  : kind === "resolve"
                    ? await resolveIssue(data)
                    : await submitReport(data);
      setResult(r);
      setConfirmation(null);
      if (r.ok) {
        router.refresh();
      }
    });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data: Record<string, unknown> = {
          ...defaults,
          ...Object.fromEntries(new FormData(form)),
        };
        for (const el of Array.from(form.elements)) {
          if (el instanceof HTMLInputElement) {
            if (el.type === "checkbox") data[el.name] = el.checked;
            else if (el.type === "number")
              data[el.name] = ["report", "transaction", "budget"].includes(kind)
                ? el.value
                : Number(el.value);
          }
          if (el instanceof HTMLSelectElement && el.multiple)
            data[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
          if (
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement
          ) {
            if (el.dataset.emails)
              data[el.name] = el.value.split(/[\s,;]+/).filter(Boolean);
            else if (el.dataset.json) {
              try {
                data[el.name] = JSON.parse(el.value);
              } catch {
                setResult({
                  ok: false,
                  message:
                    "We couldn’t read these settings. Check the format and try again.",
                });
                return;
              }
            }
          }
        }
        if (command === "REQUIREMENT") {
          data.condition_json = data.condition_type
            ? { amount: Number(data.condition_amount) }
            : {};
          delete data.condition_amount;
        }
        if (confirm) setConfirmation({ data });
        else perform(data);
      }}
    >
      {children}
      {result && (
        <p role="status" className={result.ok ? "positive" : "error-text"}>
          {result.message ??
            (result.ok
              ? "Saved successfully."
              : "We couldn’t save your changes.")}
        </p>
      )}
      <button
        className={`button ${destructive ? "danger" : "primary"}`}
        disabled={pending}
      >
        {pending ? "Saving…" : label}
      </button>
      {confirmation && (
        <ConfirmationDialog
          title={`Confirm ${label}`}
          onClose={() => {
            if (!pending) setConfirmation(null);
          }}
        >
          <p>
            {confirmation.data.promote === true
              ? "Grant Finance Administrator access to this user? They will be able to review, approve, and manage Finance records, and will no longer be able to file requests."
              : command === "CLOSE_YEAR"
                ? "Closing this fiscal year makes its records read-only. The system will check unresolved blockers before closing it."
                : kind === "resolve"
                  ? "This resolution or override will be recorded in the audit trail. Confirm that the notes explain your decision."
                  : "This change will be recorded in the audit trail. Review your selections before continuing."}
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              disabled={pending}
              onClick={() => setConfirmation(null)}
            >
              Back
            </button>
            <button
              className={`button ${destructive ? "danger" : "primary"}`}
              type="button"
              disabled={pending}
              onClick={() => perform(confirmation.data)}
            >
              {pending ? "Saving…" : "Confirm Changes"}
            </button>
          </div>
        </ConfirmationDialog>
      )}
    </form>
  );
}
