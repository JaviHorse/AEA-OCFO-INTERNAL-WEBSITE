import Link from "next/link";
import { workspace } from "@/lib/data";
import { isFinance, human, money } from "@/lib/finance";
import { requestDescriptions, requestTypeLabel } from "@/lib/ux";
import { statuses } from "@/lib/types";
import { PageHeader, Panel, Field } from "@/components/ui";
import { OperationForm } from "@/components/operation-form";
export default async function Guide({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year, ["requestTypes", "requirements"]);
  const { data: guides, error } = await w.db
    .from("faq_guides")
    .select("*")
    .or(`fiscal_year_id.is.null,fiscal_year_id.eq.${w.year.id}`)
    .order("display_order");
  if (error) throw new Error("Help & Requirements could not be loaded.");
  const editable = !!w.yearRole && isFinance(w.yearRole) && !w.readOnly;
  const explanations: Record<string, string> = {
    DRAFT:
      "Your request has not been sent. Add your details and documents, then submit.",
    SUBMITTED:
      "Finance has received your request. You can follow its progress here.",
    UNDER_OCFO_REVIEW: "Finance is checking your documents and details.",
    NEEDS_REVISION:
      "Read the finance team’s message, fix your request, and resubmit.",
    READY_FOR_CFO: "Your request is waiting for Finance’s decision.",
    APPROVED:
      "The Finance has approved your request. Expense funds are reserved when applicable.",
    PROCESSING:
      "The finance team is arranging payment or recording the outcome.",
    COMPLETED:
      "The request is finished and its financial records have been reconciled.",
    REJECTED: "The request was not approved. Open it to read the reason.",
    CANCELLED: "The request was cancelled and is closed.",
  };
  return (
    <>
      <PageHeader
        title="Help & Requirements"
        description="Choose a request type to see its requirements."
      />
      <h2 className="section-title">Request Requirements</h2>
      <div className="requirements-list">
        {w.requestTypes
          .filter((t) => t.is_active)
          .map((t) => {
            const docs = w.requirements.filter(
              (r) => r.request_type_id === t.id,
            );
            return (
              <details key={t.id} className="help-disclosure">
                <summary>{requestTypeLabel(t)}</summary>
                <div className="disclosure-body">
                  <h3>When to use this</h3>
                  <p>
                    {t.description ||
                      requestDescriptions[t.code] ||
                      "Send this request for finance review."}
                  </p>
                  <h3>Required documents</h3>
                  <ul>
                    {docs
                      .filter((r) => !r.condition_type && r.is_required)
                      .map((r) => (
                        <li key={r.id}>
                          {r.label}
                          {r.template_url && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                className="text-link"
                                href={r.template_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Template →
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                  </ul>
                  {!docs.length && (
                    <p>Ask Finance which supporting documents apply.</p>
                  )}
                  {docs.some((r) => r.condition_type) && (
                    <>
                      <h3>Conditional documents</h3>
                      <ul>
                        {docs
                          .filter((r) => r.condition_type)
                          .map((r) => (
                            <li key={r.id}>
                              {r.label} if the amount is below{" "}
                              {money(r.condition_json?.amount ?? 15000)}
                              {r.template_url && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a
                                    className="text-link"
                                    href={r.template_url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Template →
                                  </a>
                                </>
                              )}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                  {!editable &&
                    w.yearRole === "DEPARTMENT_MEMBER" &&
                    !w.readOnly && (
                      <Link
                        className="button secondary"
                        href={`/requests/new?year=${w.year.id}&type=${t.code}`}
                      >
                        Start {requestTypeLabel(t)}
                      </Link>
                    )}
                </div>
              </details>
            );
          })}
      </div>
      <details className="help-disclosure">
        <summary>Preparing your Google Drive folder</summary>
        <div className="disclosure-body">
          <ol>
            <li>
              Put the required documents in one folder. Use actual files rather
              than shortcuts.
            </li>
            <li>
              Share that folder with Finance reviewers and the integration email shown in
              your request.
            </li>
            <li>Paste the folder link and choose Check Folder.</li>
            <li>
              Review the checklist. Finance will verify document contents after
              submission.
            </li>
          </ol>
          <p>
            Finance opens your submitted folder from the request register to check requirements. Keep it shared and keep payment and bank details inside your supporting documents.
          </p>
        </div>
      </details>
      <details className="help-disclosure">
        <summary>What does my request status mean?</summary>
        <div className="disclosure-body">
          <dl className="status-help">
            {statuses.map((status) => (
              <div key={status}>
                <dt>{human(status)}</dt>
                <dd>{explanations[status]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      <details className="help-disclosure">
        <summary>Common questions</summary>
        <div className="disclosure-body">
          <details>
            <summary>How much money can my department still use?</summary>
            <p>
              Available funds equal your current budget, minus recorded expenses
              and funds reserved for approved requests. Revenue is tracked
              separately.
            </p>
          </details>
          <details>
            <summary>How does reimbursement work?</summary>
            <p>
              Choose Reimbursement when someone has already paid for an approved
              AEA expense. Prepare the listed requirements, share your folder,
              and submit. Finance checks the documents before Finance decides.
            </p>
          </details>
          <details>
            <summary>Does my request need a project?</summary>
            <p>
              No. Choose No project / General department request when the
              expense is not linked to a project. Your department remains
              responsible for the budget.
            </p>
          </details>
          <details>
            <summary>What if my request needs revision?</summary>
            <p>
              Open the request from Needs Your Attention, read the finance
              team’s message, then choose Fix Request. Update the details or
              folder, check folder access again, and submit.
            </p>
          </details>
        </div>
      </details>
      {guides?.map((g) => (
        <details key={g.id} className="help-disclosure">
          <summary>{g.title}</summary>
          <div className="disclosure-body">
            <div className="guide-content">{g.content}</div>
            {editable && (
              <details className="review-entry">
                <summary>Edit this guide</summary>
                <GuideEditor guide={g} />
              </details>
            )}
          </div>
        </details>
      ))}
      {editable && (
        <details className="help-disclosure">
          <summary>Add a guide</summary>
          <div className="disclosure-body">
            <GuideEditor />
          </div>
        </details>
      )}
    </>
  );
}
function GuideEditor({
  guide,
}: {
  guide?: {
    id: string;
    title: string;
    slug: string;
    content: string;
    is_published: boolean;
    display_order: number;
  };
}) {
  return (
    <OperationForm
      kind="guide"
      defaults={guide?.id ? { id: guide.id } : {}}
      label="Save guide"
    >
      <div className="form-grid">
        <Field label="Title">
          <input name="title" required defaultValue={guide?.title} />
        </Field>
        <Field label="Slug">
          <input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            defaultValue={guide?.slug}
          />
        </Field>
      </div>
      <Field label="Content">
        <textarea
          name="content"
          rows={7}
          required
          defaultValue={guide?.content}
        />
      </Field>
      <Field label="Display order">
        <input
          type="number"
          name="display_order"
          defaultValue={guide?.display_order ?? 0}
        />
      </Field>
      <label className="checkbox-field">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={guide?.is_published ?? true}
        />
        Published
      </label>
    </OperationForm>
  );
}
