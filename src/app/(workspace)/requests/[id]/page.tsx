import { notFound } from "next/navigation";
import { workspace } from "@/lib/data";
import { session } from "@/lib/auth";
import {
  money,
  cents,
  decimal,
  isFinance,
  requiredDocuments,
  human,
} from "@/lib/finance";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { driveClient } from "@/lib/google-drive";
import {
  WorkflowActions,
  ReviewForm,
  CommentForm,
  DocumentCheck,
  ArchiveRetry,
  FlagForm,
} from "@/components/review-panel";
export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  const s = await session();
  const { data: r } = await s.db
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();
  const w = await workspace(r.fiscal_year_id);
  const role = w.yearRole!;
  const finance = isFinance(role);
  const { data: people } = await w.db
    .from("users")
    .select("id,full_name,email");
  const nameOf = (userId: string) =>
    people?.find((person) => person.id === userId)?.full_name ??
    people?.find((person) => person.id === userId)?.email ??
    userId.slice(0, 8);
  const type = w.requestTypes.find((t) => t.id === r.request_type_id)!;
  const department = w.departments.find((d) => d.id === r.department_id);
  const project = w.projects.find((pr) => pr.id === r.project_id);
  const f = w.financials.find((row) => row.department_id === r.department_id);
  const tables = [
    "request_comments",
    "request_status_history",
    "request_reviews",
    "request_document_checks",
    "drive_documents",
    "commitments",
    "approvals",
    "notifications",
  ];
  const results = await Promise.all(
    tables.map((table) => w.db.from(table).select("*").eq("request_id", id)),
  );
  results.forEach((result) => {
    if (result.error)
      throw new Error("Request supporting records could not be loaded.");
  });
  const [
    comments,
    history,
    reviews,
    checks,
    documents,
    commitments,
    approvals,
    notifications,
  ] = results.map((result) => result.data ?? []);
  const canEdit = !w.readOnly && ["DRAFT", "NEEDS_REVISION"].includes(r.status);
  if (p.edit && canEdit) {
    let email = "";
    try {
      email = (await driveClient()).email;
    } catch {}
    return (
      <>
        <PageHeader
          title="Revise your request."
          description="The status and document history will be preserved."
        />
        <RequestForm
          yearId={w.year.id}
          departments={w.departments}
          types={w.requestTypes}
          projects={w.projects}
          requirements={w.requirements}
          projectDepartments={w.projectDepartments}
          integrationEmail={email}
          existing={r}
        />
      </>
    );
  }
  const checklist = requiredDocuments(
    w.requirements.filter((q) => q.request_type_id === r.request_type_id),
    String(r.amount),
  );
  const issues = w.issues.filter(
    (i) => i.entity_id === id && i.status === "OPEN",
  );
  return (
    <>
      <PageHeader
        eyebrow={r.reference_code ?? "DRAFT REQUEST"}
        title={r.title}
        description={`${department?.code} · ${type.name} · ${w.year.label}`}
        action={
          <div className="action-buttons">
            <Badge value={r.status} />
            {canEdit && (
              <a className="button secondary" href={`/requests/${id}?edit=1`}>
                Edit / submit request
              </a>
            )}
          </div>
        }
      />
      {issues.map((i) => (
        <div
          className={`alert ${i.severity === "CRITICAL" ? "critical" : ""}`}
          key={i.id}
        >
          {i.severity}: {i.description}
        </div>
      ))}
      <div className="detail-grid">
        <div>
          <Panel title="Request overview">
            <dl className="detail-list">
              <div>
                <dt>Amount</dt>
                <dd className="large-money">{money(String(r.amount))}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{department?.name}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{project?.name ?? "Non-project"}</dd>
              </div>
              <div>
                <dt>Requester</dt>
                <dd>{nameOf(r.requester_user_id)}</dd>
              </div>
              <div>
                <dt>Relevant date</dt>
                <dd>{r.relevant_date ?? "—"}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{r.notes ?? "—"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel
            title="Supporting documents"
            subtitle="The official AEA copy is the finance record of truth."
          >
            <div className="drive-links">
              {r.source_folder_url && (
                <a
                  className="button secondary"
                  href={r.source_folder_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source folder ↗
                </a>
              )}
              {r.official_folder_url && (
                <a
                  className="button secondary"
                  href={r.official_folder_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official AEA folder ↗
                </a>
              )}
              <Badge value={r.drive_copy_status} />
            </div>
            {r.drive_error_message && (
              <p className="error-text">{r.drive_error_message}</p>
            )}
            {finance &&
              !w.readOnly &&
              (["FAILED", "PENDING"].includes(r.drive_copy_status) ||
                (r.drive_copy_status === "COPYING" &&
                  r.drive_copy_started_at &&
                  Date.now() - new Date(r.drive_copy_started_at).getTime() >
                    300000)) && <ArchiveRetry id={id} />}
            <div className="document-list">
              {checklist.map((req) => (
                <DocumentCheck
                  id={id}
                  key={req.id}
                  requirement={req}
                  verified={checks.some(
                    (c) =>
                      c.document_requirement_id === req.id && c.is_verified,
                  )}
                  editable={
                    finance &&
                    !w.readOnly &&
                    [
                      "SUBMITTED",
                      "UNDER_OCFO_REVIEW",
                      "READY_FOR_CFO",
                      "NEEDS_REVISION",
                    ].includes(r.status)
                  }
                />
              ))}
            </div>
            <details>
              <summary>{documents.length} archived files</summary>
              <ul className="file-list">
                {documents.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.official_file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.file_name} ↗
                    </a>
                    <small>
                      {new Date(d.copied_at).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
          </Panel>
          {finance && (
            <Panel
              title="OCFO collaborative review"
              subtitle="Reviews inform the CFO’s decision. Unanimous approval is not required."
            >
              <p>
                {reviews.length} reviewer{reviews.length === 1 ? "" : "s"} ·{" "}
                {reviews.filter((r) => r.review_status === "REVIEWED").length}{" "}
                reviewed
              </p>
              {reviews.map((rv) => (
                <div className="review-entry" key={rv.id}>
                  <Badge value={rv.review_status} />
                  <strong>{nameOf(rv.reviewer_user_id)}</strong>
                  <p>
                    {rv.recommendation}: {rv.comments}
                  </p>
                </div>
              ))}
              {!w.readOnly &&
                ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(
                  r.status,
                ) && <ReviewForm id={id} />}
            </Panel>
          )}
          <Panel
            title="Conversation"
            subtitle="Department-visible comments and finance follow-ups."
          >
            {comments.length ? (
              comments
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((c) => (
                  <div className="comment" key={c.id}>
                    <div>
                      <strong>{nameOf(c.author_user_id)}</strong>
                      <Badge value={c.visibility} />
                    </div>
                    <p>{c.body}</p>
                    <small>
                      {new Date(c.created_at).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </small>
                  </div>
                ))
            ) : (
              <p className="muted">No comments yet.</p>
            )}
            {!w.readOnly && <CommentForm id={id} role={role} />}
          </Panel>
        </div>
        <aside>
          {finance && (
            <Panel
              title="Budget impact"
              subtitle="Department funds before and after approval"
            >
              <dl className="detail-list">
                <div>
                  <dt>Current approved budget</dt>
                  <dd>{money(f?.current_budget ?? "0")}</dd>
                </div>
                <div>
                  <dt>Actual expenses</dt>
                  <dd>{money(f?.actual_expenses ?? "0")}</dd>
                </div>
                <div>
                  <dt>Active commitments</dt>
                  <dd>{money(f?.active_commitments ?? "0")}</dd>
                </div>
                <div>
                  <dt>Available before</dt>
                  <dd>{money(f?.available_funds ?? "0")}</dd>
                </div>
                <div>
                  <dt>Available after approval</dt>
                  <dd className="positive">
                    {money(
                      type.creates_commitment && !r.approved_at
                        ? decimal(
                            cents(f?.available_funds ?? "0") -
                              cents(String(r.amount)),
                          )
                        : (f?.available_funds ?? "0"),
                    )}
                  </dd>
                </div>
              </dl>
              <p className="subtle-note">
                {type.creates_commitment
                  ? "Approval reserves funds immediately. Actual expense reduces the remaining commitment."
                  : "This request does not create an expense commitment."}
              </p>
            </Panel>
          )}
          <Panel
            title={role === "CFO_ADMIN" ? "CFO decision" : "Workflow actions"}
          >
            <WorkflowActions
              id={id}
              status={r.status}
              role={role}
              readOnly={w.readOnly}
            />
          </Panel>
          <Panel title="Status history">
            <ol className="timeline">
              {history
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((h) => (
                  <li key={h.id}>
                    <strong>{human(h.to_status)}</strong>
                    <small>
                      {new Date(h.created_at).toLocaleString("en-PH", {
                        timeZone: "Asia/Manila",
                      })}
                    </small>
                    {h.notes && <p>{h.notes}</p>}
                  </li>
                ))}
            </ol>
          </Panel>
          <Panel title="Financial records">
            {commitments.map((c) => (
              <div key={c.id}>
                <Badge value={c.status} />
                <p>Original: {money(String(c.original_amount))}</p>
                <p>Remaining: {money(String(c.remaining_amount))}</p>
              </div>
            ))}
            {w.transactions
              .filter((t) => t.request_id === id)
              .map((t) => (
                <p key={t.id}>
                  {t.type} · {money(String(t.amount))} · {t.transaction_date}
                </p>
              ))}
            {!commitments.length &&
              !w.transactions.some((t) => t.request_id === id) && (
                <p className="muted">No commitments or transactions yet.</p>
              )}
          </Panel>
          {finance && (
            <Panel title="Approval record">
              {approvals.map((a) => (
                <div className="review-entry" key={a.id}>
                  <Badge value={a.decision} />
                  <p>
                    {a.notes ?? "No override"} ·{" "}
                    {new Date(a.decided_at).toLocaleDateString("en-PH")}
                  </p>
                </div>
              ))}
              <p className="muted">
                All decisions and overrides are audit logged.
              </p>
            </Panel>
          )}
          <Panel title="Notification history">
            {notifications.length ? (
              notifications.map((n) => (
                <div className="review-entry" key={n.id}>
                  <Badge value={n.delivery_status} />
                  <p>
                    {human(n.event_type)} · {n.recipient}
                  </p>
                  {n.error && <p className="error-text">{n.error}</p>}
                </div>
              ))
            ) : (
              <p className="muted">No notifications yet.</p>
            )}
          </Panel>
          {finance && !w.readOnly && (
            <Panel title="Flag an issue">
              <FlagForm id={id} />
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
