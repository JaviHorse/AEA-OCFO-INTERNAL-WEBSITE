"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Field, Panel } from "./ui";
import { cents, money, requiredDocuments } from "@/lib/finance";
import { requestDescriptions, requestTypeLabel } from "@/lib/ux";
import { validateDriveAction, saveRequest } from "@/app/actions";
import type {
  Department,
  RequestType,
  Project,
  Requirement,
  FinanceRequest,
} from "@/lib/types";
const steps = [
  "What do you need?",
  "Request details",
  "Prepare your requirements",
  "Review & Submit",
];
export function RequestForm({
  yearId,
  departments,
  types,
  projects,
  requirements,
  projectDepartments,
  integrationEmail,
  existing,
  initialType,
  finance = false,
}: {
  yearId: string;
  departments: Department[];
  types: RequestType[];
  projects: Project[];
  requirements: Requirement[];
  projectDepartments: { project_id: string; department_id: string }[];
  integrationEmail: string;
  existing?: FinanceRequest;
  initialType?: string;
  finance?: boolean;
}) {
  const router = useRouter();
  const creationKey = useRef<string | undefined>(undefined);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const detailsForm = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState(existing ? 2 : 0);
  const [type, setType] = useState(
    existing?.request_type_id ??
      types.find((t) => t.code === initialType || t.id === initialType)?.id ??
      "",
  );
  const [department, setDepartment] = useState(
    existing?.department_id ?? departments[0]?.id ?? "",
  );
  const [project, setProject] = useState(existing?.project_id ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(
    existing?.relevant_date ??
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [url, setUrl] = useState(existing?.source_folder_url ?? "");
  const [validated, setValidated] = useState("");
  const [folder, setFolder] = useState<{
    name: string;
    files: { name: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [folderError, setFolderError] = useState("");
  const [prepared, setPrepared] = useState<string[]>([]);
  const selected = types.find((t) => t.id === type);
  const departmentName =
    departments.find((d) => d.id === department)?.code ?? "Your department";
  const possibleProjects = projects.filter((p) =>
    projectDepartments.some(
      (pd) => pd.project_id === p.id && pd.department_id === department,
    ),
  );
  const allRequirements = requirements.filter(
    (r) => r.request_type_id === type,
  );
  let checklist: Requirement[] = [];
  let amountValid = false;
  try {
    amountValid =
      cents(amount) !== 0n &&
      (selected?.code === "BUDGET_CHANGE" || cents(amount) > 0n);
    checklist = requiredDocuments(allRequirements, amount);
  } catch {
    checklist = allRequirements.filter((r) => !r.condition_type);
  }
  const ready = !!validated && validated === url && !!folder?.files.length;
  const changeStep = (next: number) => {
    setError("");
    setStep(next);
    requestAnimationFrame(() => stepHeading.current?.focus());
  };
  function next() {
    if (step === 0 && !selected) {
      setError("Choose a request type to continue.");
      return;
    }
    if (
      step === 1 &&
      (!detailsForm.current?.reportValidity() || !amountValid)
    ) {
      setError("Complete your request details with a valid amount.");
      return;
    }
    changeStep(step + 1);
  }
  function save(submit: boolean) {
    if (
      !selected ||
      !department ||
      title.trim().length < 3 ||
      !date ||
      !amountValid
    ) {
      setError("Complete your request details before saving.");
      setStep(1);
      return;
    }
    if (submit && !ready) {
      setError("Check your Google Drive folder before submitting.");
      setStep(2);
      return;
    }
    start(async () => {
      setError("");
      creationKey.current ??= crypto.randomUUID();
      const result = await saveRequest({
        creation_key: creationKey.current,
        id: existing?.id,
        fiscal_year_id: yearId,
        department_id: department,
        request_type_id: type,
        project_id: project,
        title,
        amount,
        relevant_date: date,
        notes,
        source_folder_url: url,
        submit,
      });
      if (result.ok) router.push(`/requests/${result.id}?year=${yearId}`);
      else
        setError(
          result.message ?? "We couldn’t save your request. Please try again.",
        );
    });
  }
  return (
    <div className="request-wizard" aria-busy={pending}>
      <ol className="wizard-steps" aria-label="Request steps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={step === i ? "current" : i < step ? "done" : ""}
            aria-current={step === i ? "step" : undefined}
          >
            <span>{i < step ? "✓" : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <h2 className="wizard-title" ref={stepHeading} tabIndex={-1}>
        Step {step + 1}: {steps[step]}
      </h2>
      {step === 0 && (
        <div
          className="request-type-grid"
          role="group"
          aria-label="Choose request type"
        >
          {types.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`request-type-card ${type === t.id ? "selected" : ""}`}
              aria-pressed={type === t.id}
              onClick={() => {
                setType(t.id);
                setPrepared([]);
              }}
            >
              <strong>{requestTypeLabel(t)}</strong>
              <span>
                {t.description ||
                  requestDescriptions[t.code] ||
                  "Submit this request for finance review."}
              </span>
            </button>
          ))}
        </div>
      )}
      {step === 1 && (
        <Panel
          title="Request Details"
          subtitle={
            selected
              ? requestTypeLabel(selected)
              : "Choose a request type first."
          }
        >
          <form
            ref={detailsForm}
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <div className="form-grid">
              <Field
                label="Department"
                hint={
                  !finance && departments.length === 1
                    ? "Your department is selected automatically."
                    : undefined
                }
              >
                <input value={departmentName} readOnly />
              </Field>
              <Field label="Project (optional)">
                <select
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">
                    No project / General department request
                  </option>
                  {possibleProjects.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Amount (PHP)"
                hint={
                  selected?.code === "BUDGET_CHANGE"
                    ? "Use a negative amount to request a budget reduction."
                    : undefined
                }
              >
                <input
                  type="number"
                  step="0.01"
                  min={selected?.code === "BUDGET_CHANGE" ? undefined : "0.01"}
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setPrepared([]);
                  }}
                  required
                  placeholder="0.00"
                />
              </Field>
              <Field label="Short title / purpose">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={3}
                  maxLength={160}
                  placeholder="e.g. Economics Week speaker reimbursement"
                />
              </Field>
              <Field label="Relevant date">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={4000}
                placeholder="Anything the finance team should know?"
              />
            </Field>
            <button className="sr-only" type="submit">
              Continue
            </button>
          </form>
        </Panel>
      )}
      {step === 2 && (
        <div className="wizard-documents">
          <Panel
            title="Required Documents"
            subtitle={
              selected
                ? requestTypeLabel(selected)
                : "Choose a request type first."
            }
          >
            <p className="muted">
              Tick items as you prepare them. Finance will verify their contents
              after submission.
            </p>
            <ul className="checklist">
              {checklist.map((r) => (
                <li key={r.id}>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={prepared.includes(r.id)}
                      onChange={(e) =>
                        setPrepared(
                          e.target.checked
                            ? [...prepared, r.id]
                            : prepared.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span>
                      {r.label}
                      {r.condition_type && (
                        <small>
                          Required below{" "}
                          {money(r.condition_json?.amount ?? 15000)}
                        </small>
                      )}
                    </span>
                  </label>
                  {r.template_url && (
                    <a
                      className="text-link"
                      href={r.template_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open template →
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {allRequirements
              .filter((r) => r.condition_type)
              .map((r) => (
                <p className="conditional-note" key={r.id}>
                  {r.label}:{" "}
                  {!amountValid
                    ? "enter an amount to check whether this is required."
                    : checklist.some((c) => c.id === r.id)
                      ? "Required for this amount."
                      : "Not required for this amount."}
                </p>
              ))}
            {!checklist.length && (
              <p>
                Check Help & Requirements or ask Finance about supporting
                documents for this request.
              </p>
            )}
          </Panel>
          <Panel
            title="Google Drive Folder"
            subtitle="Place your requirements in one Google Drive folder. Share it with Finance reviewers and the integration account below."
          >
            <div className="integration-note">
              <div>
                <strong>Share your folder with</strong>
                <code>
                  {integrationEmail ||
                    "Ask Finance for the AEA Finance sharing email."}
                </code>
              </div>
            </div>
            <Field label="Google Drive Folder URL">
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setValidated("");
                  setFolder(null);
                  setFolderError("");
                }}
                placeholder="https://drive.google.com/drive/folders/…"
              />
            </Field>
            <button
              className="button secondary"
              type="button"
              disabled={pending || !url}
              onClick={() =>
                start(async () => {
                  setFolderError("");
                  setValidated("");
                  setFolder(null);
                  const result = await validateDriveAction(url);
                  if (result.ok) {
                    setValidated(url);
                    setFolder(
                      result.data as {
                        name: string;
                        files: { name: string }[];
                      },
                    );
                  } else
                    setFolderError(
                      result.message ??
                        "We couldn’t access this Google Drive folder. Check the link and sharing settings, then try again.",
                    );
                })
              }
            >
              {pending ? "Checking folder…" : "Check Folder"}
            </button>
            <div role="status" aria-live="polite">
              {folderError && <p className="error-text">{folderError}</p>}
              {folder && (
                <div className="validation-success">
                  <strong>Folder accessible: {folder.name}</strong>
                  <p>
                    {folder.files.length} files found. Ready to submit for
                    Finance verification.
                  </p>
                  <details>
                    <summary>View files in this folder</summary>
                    <ul>
                      {folder.files.map((f, i) => (
                        <li key={i}>{f.name}</li>
                      ))}
                    </ul>
                  </details>
                  <p>
                    Required documents may still be missing. Folder access does
                    not confirm document completeness.
                  </p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      )}
      {step === 3 && (
        <Panel
          title="Review your request"
          subtitle="Check the details before you send it to Finance."
        >
          <dl className="detail-list">
            <div>
              <dt>Department</dt>
              <dd>{departmentName}</dd>
            </div>
            <div>
              <dt>Request Type</dt>
              <dd>{selected ? requestTypeLabel(selected) : "Not selected"}</dd>
            </div>
            <div>
              <dt>Purpose</dt>
              <dd>{title}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{amountValid ? money(amount) : "Enter a valid amount"}</dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>
                {possibleProjects.find((p) => p.id === project)?.name ??
                  "General department request"}
              </dd>
            </div>
            <div>
              <dt>Relevant date</dt>
              <dd>{date}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{notes || "None"}</dd>
            </div>
            <div>
              <dt>Drive Folder</dt>
              <dd>
                {url ? (
                  <a
                    href={url}
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {folder?.name ?? "Open folder"} ↗
                  </a>
                ) : (
                  "Not added"
                )}{" "}
                ·{" "}
                {ready ? "Access checked" : "Check required before submission"}
              </dd>
            </div>
            <div>
              <dt>Required Documents</dt>
              <dd>
                <ul>
                  {checklist.map((r) => (
                    <li key={r.id}>{r.label}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <p className="subtle-note">
            {selected?.creates_commitment
              ? "Funds are reserved only after Finance approval, not when you submit."
              : "Finance will review this request before Finance decides."}{" "}
            Your request will be recorded in the Finance sheet. Finance will review the files in your submitted folder.
          </p>
        </Panel>
      )}
      {error && (
        <div className="alert critical" role="alert">
          {error}
        </div>
      )}
      <div className="wizard-actions">
        {step > 0 && (
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => changeStep(step - 1)}
          >
            Back
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            className="button primary"
            disabled={pending || (step === 0 && !type)}
            onClick={next}
          >
            Continue →
          </button>
        ) : (
          <div className="action-buttons">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => save(false)}
            >
              Save Draft
            </button>
            <button
              className="button primary"
              disabled={pending || !ready}
              onClick={() => save(true)}
            >
              {pending ? "Saving your request…" : "Submit Request"}
            </button>
          </div>
        )}
      </div>
      {step === 3 && !ready && (
        <p className="subtle-note">
          You can save a draft now, or go back to check your folder before
          submitting.
        </p>
      )}
    </div>
  );
}
