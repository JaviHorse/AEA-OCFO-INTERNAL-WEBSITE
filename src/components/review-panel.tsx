"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { visibleTargets, human, isFinance } from "@/lib/finance";
import type { Role, Status, Requirement } from "@/lib/types";
import { requestAction, retryRegisterSync } from "@/app/actions";
import { Field } from "./ui";
import { ConfirmationDialog } from "./confirmation-dialog";
export function WorkflowActions({
  id,
  status,
  role,
  readOnly,
  warnings = [],
}: {
  id: string;
  status: Status;
  role: Role;
  readOnly: boolean;
  warnings?: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Status | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const targets = readOnly ? [] : visibleTargets(status, role);
  if (!targets.length)
    return (
      <p className="muted">
        {readOnly
          ? "This fiscal year is read-only."
          : "Check requirements and add review notes below."}
      </p>
    );
  return (
    <>
      <div className="action-buttons">
        {targets.map((t) => (
          <button
            className={`button ${["CANCELLED", "REJECTED"].includes(t) ? "danger destructive-action" : t === "APPROVED" ? "primary" : "secondary"}`}
            key={t}
            onClick={() => {
              setTarget(t);
              setError("");
            }}
          >
            {t === "UNDER_OCFO_REVIEW"
              ? "Begin Review"
              : t === "READY_FOR_CFO"
                ? "Mark Ready for Approval"
                : human(
                    t === "APPROVED"
                      ? "APPROVE"
                      : t === "REJECTED"
                        ? "REJECT"
                        : t === "CANCELLED"
                          ? "CANCEL"
                          : t === "NEEDS_REVISION"
                            ? "INCOMPLETE"
                            : t,
                  )}
          </button>
        ))}
      </div>
      {target && (
        <ConfirmationDialog
          title={`Confirm ${human(target)}`}
          onClose={() => {
            if (!pending) setTarget("");
          }}
        >
          <p>
            This decision will be recorded in the request’s status history and
            audit trail.
          </p>
          {target === "APPROVED" &&
            warnings.map((warning) => (
              <p className="alert critical" key={warning}>
                {warning}
              </p>
            ))}
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
              disabled={
                pending ||
                ((["REJECTED", "CANCELLED", "NEEDS_REVISION"].includes(
                  target,
                ) ||
                  (target === "APPROVED" && warnings.length > 0)) &&
                  !notes.trim())
              }
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
                    if (isFinance(role))
                      router.push(
                        result.message
                          ? "/approvals?notice=delivery-warning"
                          : "/approvals",
                      );
                    router.refresh();
                  } else setError(result.message ?? "Decision failed.");
                })
              }
            >
              {pending ? "Saving…" : "Confirm decision"}
            </button>
          </div>
        </ConfirmationDialog>
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
            {["PENDING_REVIEW", "REVIEWED", "HAS_COMMENTS"].map((v) => (
              <option key={v} value={v}>
                {human(v)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recommendation">
          <select name="recommendation">
            {["NONE", "APPROVE", "REVISION"].map((v) => (
              <option key={v} value={v}>
                {human(v)}
              </option>
            ))}
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
  const [visibility, setVisibility] = useState(
    isFinance(role) ? "INTERNAL_OCFO" : "REQUESTER_VISIBLE",
  );
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
            setVisibility(
              isFinance(role) ? "INTERNAL_OCFO" : "REQUESTER_VISIBLE",
            );
            router.refresh();
          }
        });
      }}
    >
      <Field label={isFinance(role) ? "Comment" : "Message to Finance"}>
        <textarea name="notes" rows={3} required maxLength={4000} />
      </Field>
      {isFinance(role) ? (
        <fieldset className="comment-visibility">
          <legend>Visibility</legend>
          {isFinance(role) && (
            <label>
              <input
                type="radio"
                name="visibility"
                value="INTERNAL_OCFO"
                checked={visibility === "INTERNAL_OCFO"}
                onChange={() => setVisibility("INTERNAL_OCFO")}
              />{" "}
              Internal Finance Note{" "}
              <small>Only Finance administrators can see this.</small>
            </label>
          )}
          <label>
            <input
              type="radio"
              name="visibility"
              value="REQUESTER_VISIBLE"
              checked={visibility === "REQUESTER_VISIBLE"}
              onChange={() => setVisibility("REQUESTER_VISIBLE")}
            />{" "}
            {isFinance(role) ? "Message to Requester" : "Message to Finance"}
            <small>The requester’s department will see this message.</small>
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="visibility" value="REQUESTER_VISIBLE" />
      )}
      <div className="form-actions">
        <button className="button primary" disabled={pending}>
          {isFinance(role) ? "Post comment" : "Send Message"}
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
  viewOnly = false,
}: {
  id: string;
  requirement: Requirement;
  verified: boolean;
  editable: boolean;
  viewOnly?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="document-check">
      <label>
        {!viewOnly && (
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
        )}
        <span>
          {requirement.label}
          <small>
            {verified ? "Verified by finance" : "Waiting for Finance to check"}
          </small>
        </span>
      </label>
      {error && <small className="error-text">{error}</small>}
    </div>
  );
}
export function RegisterSyncRetry({ id }: { id: string }) {
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
            const result = await retryRegisterSync(id);
            if (result.ok) router.refresh();
            else setError(result.message ?? "Retry failed.");
          })
        }
      >
        {pending ? "Recording…" : "Retry Sheets Recording"}
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
            <option key={v} value={v}>
              {human(v)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Severity">
        <select name="severity">
          {["WARNING", "HIGH", "CRITICAL"].map((v) => (
            <option key={v} value={v}>
              {human(v)}
            </option>
          ))}
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
