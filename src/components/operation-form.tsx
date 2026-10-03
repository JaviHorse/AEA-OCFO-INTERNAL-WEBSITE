"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAction,
  recordTransaction,
  saveGuide,
  resolveIssue,
  submitReport,
  type ActionResult,
} from "@/app/actions";
export function OperationForm({
  children,
  command,
  kind = "admin",
  defaults = {},
  label = "Save",
  confirm = false,
}: {
  children: React.ReactNode;
  command?: string;
  kind?: "admin" | "transaction" | "guide" | "resolve" | "report";
  defaults?: Record<string, unknown>;
  label?: string;
  confirm?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !confirmed) {
          setConfirmed(true);
          return;
        }
        const form = e.currentTarget;
        const fd = new FormData(form);
        const data: Record<string, unknown> = {
          ...defaults,
          ...Object.fromEntries(fd),
        };
        for (const el of Array.from(form.elements)) {
          if (el instanceof HTMLInputElement) {
            if (el.type === "checkbox") data[el.name] = el.checked;
            else if (el.type === "number")
              data[el.name] =
                kind === "transaction" || kind === "report"
                  ? el.value
                  : Number(el.value);
            else if (el.dataset.json) {
              try {
                data[el.name] = JSON.parse(el.value);
              } catch {
                setResult({
                  ok: false,
                  message: `${el.name} must contain valid JSON.`,
                });
                return;
              }
            }
          }
          if (el instanceof HTMLSelectElement && el.multiple)
            data[el.name] = Array.from(el.selectedOptions).map((o) => o.value);
          if (el instanceof HTMLTextAreaElement && el.dataset.json) {
            try {
              data[el.name] = JSON.parse(el.value);
            } catch {
              setResult({
                ok: false,
                message: `${el.name} must contain valid JSON.`,
              });
              return;
            }
          }
        }
        if (kind === "transaction")
          data.idempotency_key = data.idempotency_key ?? crypto.randomUUID();
        start(async () => {
          const r =
            kind === "admin"
              ? await adminAction(command!, data)
              : kind === "transaction"
                ? await recordTransaction(data)
                : kind === "guide"
                  ? await saveGuide(data)
                  : kind === "resolve"
                    ? await resolveIssue(data)
                    : await submitReport(data);
          setResult(r);
          setConfirmed(false);
          if (r.ok) {
            if (kind === "transaction") form.reset();
            router.refresh();
          }
        });
      }}
    >
      {children}
      {result && (
        <p role="status" className={result.ok ? "positive" : "error-text"}>
          {result.message ??
            (result.ok ? "Saved successfully." : "Could not save.")}
        </p>
      )}
      {confirmed && (
        <div className="alert">
          Confirm this action. It will be recorded in the audit trail.
        </div>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Saving…" : confirmed ? "Confirm action" : label}
      </button>
      {confirmed && (
        <button
          className="button secondary"
          type="button"
          onClick={() => setConfirmed(false)}
        >
          Back
        </button>
      )}
    </form>
  );
}
