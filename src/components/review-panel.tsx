"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { allowedTargets, human, isFinance } from "@/lib/finance";
import type { Role, Status, Requirement } from "@/lib/types";
import { requestAction, retryArchive } from "@/app/actions";
import { Field } from "./ui";
export function WorkflowActions({
  id,
  status,
  role,
  readOnly,
}: {
  id: string;
  status: Status;
  role: Role;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Status | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const targets = readOnly ? [] : allowedTargets(status, role);
  if (!targets.length)
    return (
      <p className="muted">
        {readOnly
          ? "This fiscal year is read-only."
          : "No workflow actions available for your role at this stage."}
      </p>
    );
  return (
    <>
      <div className="action-buttons">
        {targets.map((t) => (
          <button
            className={`button ${t === "APPROVED" ? "primary" : "secondary"}`}
            key={t}
            onClick={() => {
              setTarget(t);
              setError("");
            }}
          >
            {human(
              t === "APPROVED"
                ? "APPROVE"
                : t === "REJECTED"
                  ? "REJECT"
                  : t === "CANCELLED"
                    ? "CANCEL"
                    : t === "NEEDS_REVISION"
                      ? "RETURN_FOR_REVISION"
                      : t,
            )}
          </button>
        ))}
      </div>
      {target && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="decision-title"
            className="modal"
          >
            <h2 id="decision-title">Confirm {human(target)}</h2>
            <p>
              This decision will be recorded in the request’s status history and
              audit trail.
            </p>
            <Field
              label="Decision notes / override reason"
              hint="Required for rejection, revision, cancellation, missing documents, and budget overrides."
            >
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
              />
            </Field>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => setTarget("")}
              >
                Back
              </button>
              <button
                className="button primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await requestAction("TRANSITION", {
                      id,
                      status: target,
                      notes,
                    });
                    if (result.ok) {
                      setTarget("");
                      setNotes("");
                      router.refresh();
                    } else setError(result.message ?? "Decision failed.");
                  })
                }
              >
                {pending ? "Saving…" : "Confirm decision"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function ReviewForm({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        start(async () => {
          const result = await requestAction("REVIEW", { id, ...data });
          setError(result.ok ? "Review saved." : (result.message ?? "Failed."));
          if (result.ok) router.refresh();
        });
      }}
    >
      <div className="form-grid">
        <Field label="Your review state">
          <select name="review_status">
            <option>PENDING_REVIEW</option>
            <option>REVIEWED</option>
            <option>HAS_COMMENTS</option>
          </select>
        </Field>
        <Field label="Recommendation">
          <select name="recommendation">
            <option>NONE</option>
            <option>APPROVE</option>
            <option>REVISION</option>
          </select>
        </Field>
      </div>
      <Field label="Internal review notes">
        <textarea name="notes" rows={3} maxLength={4000} />
      </Field>
      <button disabled={pending} className="button secondary">
        Save my review
      </button>
      {error && <p role="status">{error}</p>}
    </form>
  );
}
export function CommentForm({ id, role }: { id: string; role: Role }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        start(async () => {
          const result = await requestAction("COMMENT", { id, ...data });
          setError(result.ok ? "" : (result.message ?? "Comment failed."));
          if (result.ok) {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <Field label="Leave a comment">
        <textarea name="notes" rows={3} required maxLength={4000} />
      </Field>
      <div className="form-actions">
        <select name="visibility" aria-label="Comment visibility">
          <option value="REQUESTER_VISIBLE">Visible to department</option>
          {isFinance(role) && (
            <option value="INTERNAL_OCFO">Internal OCFO only</option>
          )}
        </select>
        <button className="button primary" disabled={pending}>
          Post comment
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
export function DocumentCheck({
  id,
  requirement,
  verified,
  editable,
}: {
  id: string;
  requirement: Requirement;
  verified: boolean;
  editable: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="document-check">
      <label>
        <input
          type="checkbox"
          checked={verified}
          disabled={!editable || pending}
          onChange={(e) => {
            const is_verified = e.target.checked;
            start(async () => {
              const result = await requestAction("VERIFY_DOCUMENT", {
                id,
                requirement_id: requirement.id,
                is_verified,
              });
              if (result.ok) router.refresh();
              else setError(result.message ?? "Verification failed.");
            });
          }}
        />
        <span>
          {requirement.label}
          <small>
            {verified
              ? "Verified by finance"
              : "Awaiting manual finance verification"}
          </small>
        </span>
      </label>
      {error && <small className="error-text">{error}</small>}
    </div>
  );
}
export function ArchiveRetry({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        className="button secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await retryArchive(id);
            if (result.ok) router.refresh();
            else setError(result.message ?? "Retry failed.");
          })
        }
      >
        {pending ? "Archiving…" : "Retry official Drive copy"}
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function FlagForm({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        start(async () => {
          const result = await requestAction("FLAG_ISSUE", { id, ...data });
          setError(
            result.ok ? "Issue flagged." : (result.message ?? "Failed."),
          );
          if (result.ok) router.refresh();
        });
      }}
    >
      <Field label="Discrepancy code">
        <select name="code">
          {[
            "AMOUNT_MISMATCH",
            "DUPLICATE_RECEIPT_SUSPECTED",
            "WRONG_DEPARTMENT",
            "SOURCE_CHANGED",
            "DOCUMENT_CHANGED_AFTER_APPROVAL",
            "CONDITIONAL_EVIDENCE_MISSING",
            "OTHER",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Severity">
        <select name="severity">
          <option>WARNING</option>
          <option>HIGH</option>
          <option>CRITICAL</option>
        </select>
      </Field>
      <Field label="Describe the issue">
        <textarea name="notes" required rows={3} />
      </Field>
      <button className="button secondary" disabled={pending}>
        Flag discrepancy
      </button>
      {error && <p role="status">{error}</p>}
    </form>
  );
}
