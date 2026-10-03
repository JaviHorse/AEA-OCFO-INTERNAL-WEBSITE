"use client";
import { useState } from "react";
import type { Department, FinanceRequest, Project } from "@/lib/types";
import { OperationForm } from "./operation-form";
import { Field } from "./ui";
export function TransactionForm({
  yearId,
  departments,
  requests,
  projects,
}: {
  yearId: string;
  departments: Department[];
  requests: FinanceRequest[];
  projects: Project[];
}) {
  const [request, setRequest] = useState("");
  const r = requests.find((r) => r.id === request);
  return (
    <OperationForm
      kind="transaction"
      defaults={{ fiscal_year_id: yearId }}
      label="Record transaction"
    >
      <div className="form-grid">
        <Field label="Approved request">
          <select
            name="request_id"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          >
            <option value="">Unlinked (if policy allows)</option>
            {requests
              .filter((r) => ["APPROVED", "PROCESSING"].includes(r.status))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reference_code} · {r.title}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Department">
          <select name="department_id" value={r?.department_id} key={request}>
            <option value="">Choose a department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select
            name="project_id"
            value={r?.project_id ?? undefined}
            key={request}
          >
            <option value="">Non-project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select name="type">
            <option>EXPENSE</option>
            <option>REVENUE</option>
          </select>
        </Field>
        <Field label="Actual amount (PHP)">
          <input name="amount" type="number" step="0.01" min="0.01" required />
        </Field>
        <Field label="Transaction date">
          <input name="transaction_date" type="date" required />
        </Field>
      </div>
      <Field label="Description">
        <input name="description" required minLength={3} maxLength={1000} />
      </Field>
    </OperationForm>
  );
}
