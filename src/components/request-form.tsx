"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FolderCheck,
  ArrowRight,
  Save,
  ExternalLink,
} from "lucide-react";
import { Field, Panel } from "./ui";
import { requiredDocuments } from "@/lib/finance";
import { validateDriveAction, saveRequest } from "@/app/actions";
import type {
  Department,
  RequestType,
  Project,
  Requirement,
  FinanceRequest,
} from "@/lib/types";
export function RequestForm({
  yearId,
  departments,
  types,
  projects,
  requirements,
  projectDepartments,
  integrationEmail,
  existing,
}: {
  yearId: string;
  departments: Department[];
  types: RequestType[];
  projects: Project[];
  requirements: Requirement[];
  projectDepartments: { project_id: string; department_id: string }[];
  integrationEmail: string;
  existing?: FinanceRequest;
}) {
  const router = useRouter();
  const creationKey = useRef<string | undefined>(undefined);
  const [pending, start] = useTransition();
  const [type, setType] = useState(
    existing?.request_type_id ?? types[0]?.id ?? "",
  );
  const [department, setDepartment] = useState(
    existing?.department_id ?? departments[0]?.id ?? "",
  );
  const [amount, setAmount] = useState(existing?.amount ?? "");
  const [url, setUrl] = useState(existing?.source_folder_url ?? "");
  const [validated, setValidated] = useState("");
  const [folder, setFolder] = useState<{
    name: string;
    files: { name: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const selected = types.find((t) => t.id === type);
  let checklist: Requirement[] = [];
  try {
    checklist = requiredDocuments(
      requirements.filter((r) => r.request_type_id === type),
      amount || "0",
    );
  } catch {
    /* The amount field displays invalid values without calculating conditions. */
  }
  const possibleProjects = projects.filter((p) =>
    projectDepartments.some(
      (pd) => pd.project_id === p.id && pd.department_id === department,
    ),
  );
  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="request-form"
      id="request-form"
    >
      <div>
        <Panel
          title="The essentials"
          subtitle="Keep the details here brief. Your supporting documents tell the rest."
        >
          <div className="form-grid">
            <Field label="Department">
              <select
                name="department_id"
                value={department}
                disabled={!!existing}
                onChange={(e) => setDepartment(e.target.value)}
                required
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Request type">
              <select
                name="request_type_id"
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Short title / purpose">
              <input
                name="title"
                defaultValue={existing?.title}
                required
                minLength={3}
                maxLength={160}
                placeholder="e.g. Economics Week speaker reimbursement"
              />
            </Field>
            <Field
              label="Amount (PHP)"
              hint={
                selected?.code === "BUDGET_CHANGE"
                  ? "Use a negative amount for a budget reduction."
                  : "Amount must be greater than zero."
              }
            >
              <input
                name="amount"
                type="number"
                step="0.01"
                min={selected?.code === "BUDGET_CHANGE" ? undefined : "0.01"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="0.00"
              />
            </Field>
            <Field label="Project (optional)">
              <select
                name="project_id"
                defaultValue={existing?.project_id ?? ""}
              >
                <option value="">Non-project request</option>
                {possibleProjects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Relevant date">
              <input
                name="relevant_date"
                type="date"
                defaultValue={
                  existing?.relevant_date ??
                  new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Manila",
                  })
                }
                required
              />
            </Field>
          </div>
          <Field label="Notes (optional)">
            <textarea
              name="notes"
              rows={3}
              defaultValue={existing?.notes ?? ""}
              maxLength={4000}
              placeholder="Anything the finance team should know?"
            />
          </Field>
        </Panel>
        <Panel
          title="Your documents"
          subtitle="Share a folder containing the required documents with the finance integration."
        >
          <div className="integration-note">
            <FolderCheck size={19} />
            <div>
              <strong>Give this account access to your source folder</strong>
              <code>
                {integrationEmail || "Ask OCFO for the service account email."}
              </code>
            </div>
          </div>
          <Field label="Google Drive folder link">
            <input
              type="url"
              name="source_folder_url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setValidated("");
                setFolder(null);
              }}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </Field>
          <button
            type="button"
            className="button secondary"
            disabled={pending || !url}
            onClick={() =>
              start(async () => {
                setError("");
                const result = await validateDriveAction(url);
                if (result.ok) {
                  setValidated(url);
                  setFolder(
                    result.data as { name: string; files: { name: string }[] },
                  );
                } else setError(result.message ?? "Folder validation failed.");
              })
            }
          >
            <FolderCheck size={16} />
            {pending ? "Checking…" : "Validate folder access"}
          </button>
          {folder && (
            <div className="validation-success">
              <strong>
                <Check size={17} /> Folder accessible: {folder.name}
              </strong>
              <ul>
                {folder.files.map((f, i) => (
                  <li key={i}>{f.name}</li>
                ))}
              </ul>
              <small>
                Access is verified. OCFO will check document types and contents
                after submission.
              </small>
            </div>
          )}
        </Panel>
        {error && (
          <div className="alert critical" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => save(false)}
          >
            <Save size={16} />
            Save draft
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending || validated !== url || !validated}
            onClick={() => save(true)}
          >
            {pending ? "Working…" : "Submit request"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <aside>
        <Panel
          title="Document checklist"
          subtitle={selected?.name ?? "Select a request type"}
        >
          <ul className="checklist">
            {checklist.map((r) => (
              <li key={r.id}>
                <span className="check-box" />
                <div>
                  <strong>{r.label}</strong>
                  {r.condition_type && (
                    <small>
                      Required when amount is below PHP{" "}
                      {r.condition_json?.amount?.toLocaleString("en-PH")}
                    </small>
                  )}
                  {r.template_url && (
                    <a href={r.template_url} target="_blank" rel="noreferrer">
                      Open template <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="checklist-note">
            Keep bank and payment details in the official documents. Only
            workflow metadata is collected here.
          </div>
        </Panel>
        <div className="subtle-note">
          When you submit, your files are copied to the official AEA Finance
          Drive. A reference ID is assigned and the finance team is notified.
        </div>
      </aside>
    </form>
  );
  function save(submit: boolean) {
    const form = document.getElementById("request-form") as HTMLFormElement;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    start(async () => {
      setError("");
      creationKey.current ??= crypto.randomUUID();
      const result = await saveRequest({
        creation_key: creationKey.current,
        ...values,
        id: existing?.id,
        fiscal_year_id: yearId,
        department_id: department,
        request_type_id: type,
        submit,
      });
      if (result.ok) router.push(`/requests/${result.id}?year=${yearId}`);
      else setError(result.message ?? "Request could not be saved.");
    });
  }
}
