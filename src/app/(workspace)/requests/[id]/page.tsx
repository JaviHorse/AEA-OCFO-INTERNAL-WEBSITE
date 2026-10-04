import Link from "next/link";
import { notFound } from "next/navigation";
import { workspace } from "@/lib/data";
import { session } from "@/lib/auth";
import {
  money,
  isFinance,
  requiredDocuments,
  human,
  visibleTargets,
} from "@/lib/finance";
import { approvalAvailable, requestTypeLabel, nextStep } from "@/lib/ux";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { RequestForm } from "@/components/request-form";
import { RequestStatusTimeline } from "@/components/request-status-timeline";
import { DetailSections } from "@/components/detail-sections";
import { requestDecision } from "@/lib/request-decisions";
import { registerUrl } from "@/lib/request-register";
import { driveClient } from "@/lib/google-drive";
import {
  WorkflowActions,
  ReviewForm,
  CommentForm,
  DocumentCheck,
  RegisterSyncRetry,
  FlagForm,
} from "@/components/review-panel";
export default async function RequestDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; decision?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  const s = await session();
  const { data: r, error } = await s.db
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new Error("We couldn’t load this request. Please try again.");
  if (!r) notFound();
  const w = await workspace(
    r.fiscal_year_id,
    [
      "departments",
      "financials",
      "requestTypes",
      "projects",
      "requirements",
      "projectDepartments",
      "transactions",
      "issues",
    ],
    { departmentId: r.department_id, requestId: id },
  );
  const role = w.yearRole ?? w.role;
  const finance = isFinance(role);
  const type = w.requestTypes.find((t) => t.id === r.request_type_id);
  if (!type) throw new Error("The request type could not be loaded.");
  const department = w.departments.find((d) => d.id === r.department_id);
  const project = w.projects.find((pr) => pr.id === r.project_id);
  const f = w.financials.find((row) => row.department_id === r.department_id);
  const tables = finance
    ? [
        "request_comments",
        "request_status_history",
        "request_reviews",
        "request_document_checks",
        "commitments",
        "approvals",
        "notifications",
      ]
    : [
        "request_comments",
        "request_status_history",
        "request_document_checks",
      ];
  const results = await Promise.all(
    tables.map((table) => w.db.from(table).select("*").eq("request_id", id)),
  );
  if (results.some((result) => result.error))
    throw new Error("Request supporting records could not be loaded.");
  const records = Object.fromEntries(
    tables.map((table, i) => [table, results[i].data ?? []]),
  );
  const comments = records.request_comments,
    history = records.request_status_history,
    reviews = records.request_reviews ?? [],
    checks = records.request_document_checks;
  const commitments = records.commitments ?? [],
    approvals = records.approvals ?? [],
    notifications = records.notifications ?? [];
  const personIds = [
    ...new Set([
      r.requester_user_id,
      ...comments.map((c) => c.author_user_id),
      ...reviews.map((rv) => rv.reviewer_user_id),
    ]),
  ];
  const { data: people } = await w.db
    .from("users")
    .select("id,full_name,email")
    .in("id", personIds);
  const nameOf = (userId: string) =>
    people?.find((person) => person.id === userId)?.full_name ??
    people?.find((person) => person.id === userId)?.email ??
    "Finance / department team";
  const canEdit =
    !isFinance(w.role) &&
    role === "DEPARTMENT_MEMBER" &&
    !w.readOnly &&
    ["DRAFT", "NEEDS_REVISION"].includes(r.status);
  if (p.edit && canEdit) {
    let email = "";
    try {
      email = (await driveClient()).email;
    } catch {}
    return (
      <>
        <PageHeader
          title={
            r.status === "NEEDS_REVISION"
              ? "Fix your request."
              : "Finish your draft."
          }
          description="Update your details and documents, then resubmit."
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
          finance={finance}
        />
      </>
    );
  }
  const { data: registerState, error: registerError } = finance && r.reference_code
    ? await w.db.from("request_register_sync").select("version,synced_version,last_error").eq("request_id", id).maybeSingle()
    : { data: null, error: null };
  const checklist = requiredDocuments(
    w.requirements.filter((q) => q.request_type_id === r.request_type_id),
    String(r.amount),
  );
  const issues = w.issues.filter(
    (i) =>
      i.entity_id === id &&
      i.status === "OPEN" &&
      (finance || /DOCUMENT|DRIVE|SOURCE_FOLDER/.test(i.code)),
  );
  const verified = checklist.filter((req) =>
    checks.some((c) => c.document_requirement_id === req.id && c.is_verified),
  ).length;
  const required = checklist.filter((req) => req.is_required);
  const requiredVerified = required.filter((req) =>
    checks.some((c) => c.document_requirement_id === req.id && c.is_verified),
  ).length;
  const after = approvalAvailable(f, r, type);
  const warnings = [
    ...(after < 0n
      ? [
          `Approving this request will exceed the department’s available budget by ${money(-after)}.`,
        ]
      : []),
    ...(requiredVerified < required.length
      ? [
          "Required documents have not all been verified. Explain any override in your decision notes.",
        ]
      : []),
    ...(issues.some((i) => i.severity === "CRITICAL")
      ? ["Critical finance issues remain open. Review them before deciding."]
      : []),
  ];
  const latestMessage = [...comments]
    .filter((c) => c.visibility === "REQUESTER_VISIBLE")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const revision = [...history]
    .filter((h) => h.to_status === "NEEDS_REVISION")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const overview = (
    <Panel title="Request summary">
      <dl className="detail-list">
        <div>
          <dt>Amount</dt>
          <dd className="large-money">{money(String(r.amount))}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>
            {department?.code} · {department?.name}
          </dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{project?.name ?? "General department request"}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>{nameOf(r.requester_user_id)}</dd>
        </div>
        <div>
          <dt>Relevant date</dt>
          <dd>{r.relevant_date ?? "Not provided"}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{r.notes || "None"}</dd>
        </div>
      </dl>
    </Panel>
  );
  const docs = (
    <Panel title="Documents">
      <div className="drive-links">
        {r.source_folder_url && <a className="button secondary" href={r.source_folder_url} target="_blank" rel="noreferrer">Open Submitted Requirements</a>}
        {finance && <a className="text-link" href={registerUrl()} target="_blank" rel="noreferrer">Open Finance Register</a>}
      </div>
      <p>{verified} / {checklist.length} documents verified by Finance.</p>
      <div className="document-list">
        {checklist.map((req) => (
          <DocumentCheck
            id={id}
            key={req.id}
            requirement={req}
            viewOnly={!finance}
            verified={checks.some(
              (c) => c.document_requirement_id === req.id && c.is_verified,
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
      {canEdit && (
        <Link href={`/requests/${id}?edit=1`} className="text-link">
          Update details or document folder →
        </Link>
      )}
    </Panel>
  );
  const conversation = (
    <Panel title={finance ? "Comments & Messages" : "Messages with Finance"}>
      {comments.length ? (
        [...comments]
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((c) => (
            <div
              className={`comment ${c.visibility === "INTERNAL_OCFO" ? "comment-internal" : "comment-visible"}`}
              key={c.id}
            >
              <div>
                <strong>{nameOf(c.author_user_id)}</strong>
                {finance && <Badge value={c.visibility} />}
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
        <p className="muted">No messages yet.</p>
      )}
      {!w.readOnly && <CommentForm id={id} role={role} />}
    </Panel>
  );
  const review = (
    <Panel title="Finance Review">
      <p>
        {reviews.filter((rv) => rv.review_status === "REVIEWED").length} /{" "}
        {reviews.length} reviewed
      </p>
      {reviews.map((rv) => (
        <div className="review-entry" key={rv.id}>
          <strong>{nameOf(rv.reviewer_user_id)}</strong>{" "}
          <Badge value={rv.review_status} />
          <p>
            {human(rv.recommendation ?? "NONE")}
            {rv.comments ? ` · ${rv.comments}` : ""}
          </p>
        </div>
      ))}
      {!w.readOnly &&
        ["SUBMITTED", "UNDER_OCFO_REVIEW", "READY_FOR_CFO"].includes(
          r.status,
        ) && <ReviewForm id={id} />}
    </Panel>
  );
  const budget = (
    <Panel
      title="Budget Impact"
      subtitle="Department funds before and after approval."
    >
      <dl className="detail-list">
        <div>
          <dt>Request Amount</dt>
          <dd>{money(String(r.amount))}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{department?.code}</dd>
        </div>
        <div>
          <dt>Current Budget</dt>
          <dd>{money(f?.current_budget ?? "0")}</dd>
        </div>
        <div>
          <dt>Spent</dt>
          <dd>{money(f?.actual_expenses ?? "0")}</dd>
        </div>
        <div>
          <dt>Committed</dt>
          <dd>{money(f?.active_commitments ?? "0")}</dd>
        </div>
        <div>
          <dt>Available Before</dt>
          <dd>{money(f?.available_funds ?? "0")}</dd>
        </div>
        <div>
          <dt>Available After Approval</dt>
          <dd className={after < 0n ? "error-text" : "positive"}>
            {money(after)}
          </dd>
        </div>
      </dl>
      <p className="subtle-note">
        {type.creates_commitment
          ? "Approval reserves funds immediately. Recording actual expenses reduces the remaining reservation."
          : "This request does not reserve expense funds. Budget requests and changes update the department allocation when approved."}
      </p>
    </Panel>
  );
  const decision = (
    <Panel title={finance ? "Decision" : "Request Actions"}>
      {finance && (
        <p>
          {verified} / {checklist.length} documents verified · {issues.length}{" "}
          open issues ·{" "}
          {reviews.filter((rv) => rv.review_status === "REVIEWED").length} /{" "}
          {reviews.length} Finance reviews completed
        </p>
      )}
      <WorkflowActions
        id={id}
        status={r.status}
        role={role}
        readOnly={w.readOnly}
        warnings={warnings}
      />
    </Panel>
  );
  const financialRecords = (
    <Panel title="Transactions & Reserved Funds">
      {commitments.map((c) => (
        <div key={c.id}>
          <Badge value={c.status} />
          <p>
            Originally reserved: {money(String(c.original_amount))} · Remaining:{" "}
            {money(String(c.remaining_amount))}
          </p>
        </div>
      ))}
      {w.transactions
        .filter((t) => t.request_id === id)
        .map((t) => (
          <p key={t.id}>
            {human(t.type)} · {money(String(t.amount))} · {t.transaction_date}
          </p>
        ))}
      {!commitments.length &&
        !w.transactions.some((t) => t.request_id === id) && (
          <p className="muted">
            No funds have been reserved or transactions recorded for this
            request yet.
          </p>
        )}
    </Panel>
  );
  const statusHistory = (
    <Panel title="History">
      <ol className="timeline">
        {[...history]
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
      {!history.length && (
        <p className="muted">Updates will appear here after you submit.</p>
      )}
    </Panel>
  );
  const audit = (
    <>
      <Panel title="Approval Record">
        {approvals.map((a) => (
          <div className="review-entry" key={a.id}>
            <Badge value={a.decision} />
            <p>
              {a.notes || "No override note"} ·{" "}
              {new Date(a.decided_at).toLocaleDateString("en-PH", {
                timeZone: "Asia/Manila",
              })}
            </p>
          </div>
        ))}
        <p className="muted">
          Decisions and overrides are recorded in the audit trail.
        </p>
      </Panel>
      <Panel title="Notification History">
        {notifications.map((n) => (
          <div className="review-entry" key={n.id}>
            <Badge value={n.delivery_status} />
            <p>
              {human(n.event_type)} · {n.recipient}
            </p>
            {n.error && <p className="error-text">{n.error}</p>}
          </div>
        ))}
        {!notifications.length && (
          <p className="muted">No notifications yet.</p>
        )}
      </Panel>
    </>
  );
  return (
    <>
      <PageHeader
        eyebrow={r.reference_code ?? "DRAFT REQUEST"}
        title={r.title}
        description={`${department?.code ?? "Your department"} · ${requestTypeLabel(type)}`}
        action={
          <div className="action-buttons">
            {requestDecision(r.status) ? <Badge value={requestDecision(r.status)!} /> : <span className="muted">{r.status === "DRAFT" ? "Draft" : r.status === "CANCELLED" ? "Cancelled" : "Awaiting decision"}</span>}
            {canEdit && (
              <Link className="button primary" href={`/requests/${id}?edit=1`}>
                {r.status === "NEEDS_REVISION" ? "Fix Request" : "Finish Draft"}
              </Link>
            )}
          </div>
        }
      />
      <RequestStatusTimeline status={r.status} />
      {finance && r.reference_code && (registerError || !registerState || registerState.version > registerState.synced_version) && <div className="alert"><div><strong>Sheets recording pending</strong><p>{registerState?.last_error || (registerError ? "Apply migration 005 to enable the request register." : "The request is saved; its register row is waiting to update.")}</p>{!w.readOnly && <RegisterSyncRetry id={id} />}</div></div>}

      {r.status !== "NEEDS_REVISION" && (
        <p className="next-step">{nextStep(r.status, finance)}</p>
      )}
      {r.status === "NEEDS_REVISION" && (
        <section className="alert" aria-label="Revision requested">
          <div>
            <strong>Needs Your Attention</strong>
            <p>
              {revision?.notes ||
                latestMessage?.body ||
                "Review the finance team’s messages below, then update and resubmit your request."}
            </p>
          </div>
        </section>
      )}
      {issues.length > 0 && (
        <Panel
          title={finance ? "Open Discrepancies" : "Documents & Follow-ups"}
        >
          {issues.map((i) => (
            <div className="review-entry" key={i.id}>
              <strong>
                {finance ? `${human(i.severity)}: ` : ""}
                {i.description}
              </strong>
              <p>
                <Link
                  className="text-link"
                  href={
                    canEdit ? `/requests/${id}?edit=1` : "#request-messages"
                  }
                >
                  {canEdit ? "Update Request →" : "Ask the Finance Team →"}
                </Link>
              </p>
            </div>
          ))}
        </Panel>
      )}
      {finance ? (
        <DetailSections
          sections={[
            {
              title: "Overview",
              content: (
                <>
                  {overview}
                  {visibleTargets(r.status, role).length > 0 && !w.readOnly && (
                    <>
                      <dl className="approval-balance">
                        <div>
                          <dt>Available Before</dt>
                          <dd>{money(f?.available_funds ?? "0")}</dd>
                        </div>
                        <div>
                          <dt>Available After Approval</dt>
                          <dd
                            className={after < 0n ? "error-text" : "positive"}
                          >
                            {money(after)}
                          </dd>
                        </div>
                      </dl>
                      {decision}
                    </>
                  )}
                </>
              ),
            },
            { title: "Documents", content: docs },
            {
              title: "Messages",
              content: <div id="request-messages">{conversation}</div>,
            },
            {
              title: "More Details",
              content: (
                <>
                  <details className="help-disclosure">
                    <summary>Finance Review</summary>
                    {review}
                  </details>
                  <details className="help-disclosure">
                    <summary>Budget Impact</summary>
                    {budget}
                  </details>
                  <details className="help-disclosure">
                    <summary>Transactions</summary>
                    {financialRecords}
                  </details>
                  <details className="help-disclosure">
                    <summary>History & Audit</summary>
                    {statusHistory}
                    {audit}
                  </details>
                  {!w.readOnly && (
                    <details className="help-disclosure">
                      <summary>Flag a Finance Issue</summary>
                      <Panel title="Flag a Finance Issue">
                        <FlagForm id={id} />
                      </Panel>
                    </details>
                  )}
                </>
              ),
            },
          ]}
        />
      ) : (
        <>
          {overview}
          <details className="help-disclosure">
            <summary>Documents</summary>
            {docs}
          </details>
          <details
            id="request-messages"
            className="help-disclosure"
            open={r.status === "NEEDS_REVISION"}
          >
            <summary>Messages with Finance</summary>
            {conversation}
          </details>
          <details className="help-disclosure">
            <summary>Request History</summary>
            {statusHistory}
          </details>
          {visibleTargets(r.status, role).length > 0 && !w.readOnly && (
            <details className="help-disclosure">
              <summary>Cancel Request</summary>
              {decision}
            </details>
          )}
        </>
      )}
    </>
  );
}
