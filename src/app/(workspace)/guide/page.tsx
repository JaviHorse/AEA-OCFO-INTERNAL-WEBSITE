import { workspace } from "@/lib/data";
import { isFinance, human } from "@/lib/finance";
import { PageHeader, Panel, Field } from "@/components/ui";
import { OperationForm } from "@/components/operation-form";
export default async function Guide({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const p = await searchParams;
  const w = await workspace(p.year);
  const { data: guides, error } = await w.db
    .from("faq_guides")
    .select("*")
    .or(`fiscal_year_id.is.null,fiscal_year_id.eq.${w.year.id}`)
    .order("display_order");
  if (error) throw new Error("Finance guide could not be loaded.");
  const editable = !!w.yearRole && isFinance(w.yearRole) && !w.readOnly;
  return (
    <>
      <PageHeader
        title="A little guidance goes a long way."
        description="Your guide to requirements, processes, and thoughtful financial decisions."
      />
      <Panel
        title="The request journey"
        subtitle="Collaborative review. Authoritative CFO decisions. Traceable completion."
      >
        <div className="guide-flow">
          {[
            "Prepare documents",
            "Submit request",
            "OCFO review",
            "CFO decision",
            "Processing",
            "Reconcile & complete",
          ].map((step, i) => (
            <span key={step}>
              {i + 1}. {step}
            </span>
          ))}
        </div>
        <p className="subtle-note">
          If a revision is needed, edit the returned request and resubmit.
          Approval reserves funds; recording actual expense reduces the
          commitment. Completion releases the unused balance.
        </p>
      </Panel>
      <Panel
        title="Document requirements"
        subtitle="PDAF applies strictly below PHP 15,000. Reimbursement and unaccredited disbursement have the same requirements."
      >
        {w.requestTypes.map((t) => (
          <details key={t.id} className="review-entry">
            <summary>{t.name}</summary>
            <ul className="file-list">
              {w.requirements
                .filter((r) => r.request_type_id === t.id)
                .map((r) => (
                  <li key={r.id}>
                    {r.label}{" "}
                    {r.condition_type && (
                      <small>
                        When amount &lt; PHP{" "}
                        {r.condition_json?.amount?.toLocaleString("en-PH")}
                      </small>
                    )}
                    {r.template_url && (
                      <a
                        className="text-link"
                        href={r.template_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Template ↗
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </Panel>
      {guides?.map((g) => (
        <Panel key={g.id} title={g.title}>
          <div className="guide-content">{g.content}</div>
          {editable && (
            <details className="review-entry">
              <summary>Edit this guide</summary>
              <GuideEditor guide={g} />
            </details>
          )}
        </Panel>
      ))}
      {editable && (
        <Panel title="Add a guide or FAQ">
          <GuideEditor />
        </Panel>
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
