// Local browser fixtures. These never connect to Supabase, Drive, or email.
export const year = {
  id: "year",
  label: "AY 2026-2027",
  code: "2627",
  is_active: true,
  is_closed: false,
  start_date: "2026-06-01",
  end_date: "2027-05-31",
};
export const departments = [
  { id: "acads", code: "ACADS", name: "Academic Affairs", is_active: true },
  { id: "crea", code: "CREA", name: "Creative Affairs", is_active: true },
];
export const types = [
  {
    id: "reimbursement",
    code: "REIMBURSEMENT",
    name: "Reimbursement",
    creates_commitment: true,
    is_active: true,
    description: null,
  },
  {
    id: "budget",
    code: "BUDGET_REQUEST",
    name: "Budget Request",
    creates_commitment: false,
    is_active: true,
    description: null,
  },
  {
    id: "change",
    code: "BUDGET_CHANGE",
    name: "Budget Change",
    creates_commitment: false,
    is_active: true,
    description: null,
  },
  {
    id: "end",
    code: "PROJECT_END_REVENUE",
    name: "PROJECT_END_REVENUE",
    creates_commitment: false,
    is_active: true,
    description: null,
  },
];
export const requirements = [
  {
    id: "invoice",
    request_type_id: "reimbursement",
    document_code: "INVOICE",
    label: "Invoice",
    is_required: true,
    condition_type: null,
  },
  {
    id: "pdaf",
    request_type_id: "reimbursement",
    document_code: "PDAF",
    label: "PDAF",
    is_required: true,
    condition_type: "AMOUNT_LT",
    condition_json: { amount: 15000 },
  },
];
export const projects = [
  {
    id: "project",
    name: "Economics Week",
    fiscal_year_id: "year",
    status: "ACTIVE",
    description: "Department activity",
  },
  {
    id: "private-project",
    name: "CREA Private Project",
    fiscal_year_id: "year",
    status: "ACTIVE",
  },
];
export const request = {
  id: "request",
  reference_code: "AEA-2627-0041",
  fiscal_year_id: "year",
  department_id: "acads",
  request_type_id: "reimbursement",
  requester_user_id: "applicant",
  title: "Speaker reimbursement",
  project_id: "project",
  amount: "15000.00",
  status: "NEEDS_REVISION",
  relevant_date: "2026-10-03",
  notes: "Speaker payment",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  submitted_at: "2026-10-01T00:00:00Z",
  source_folder_url: "https://drive.google.com/drive/folders/fixture",
};
export function getFixture() {
  const params = new URLSearchParams(location.search);
  const role = params.get("role") ?? "DEPARTMENT_MEMBER";
  const finance = role === "CFO_ADMIN" || role === "OCFO_MEMBER";
  const selectedYear = { ...year, is_closed: params.has("closed") };
  const selectedRequest = {
    ...request,
    status: params.get("status") ?? request.status,
    amount: params.has("warnings") ? "60000.00" : request.amount,
  };
  const comments = [
    {
      id: "visible",
      request_id: "request",
      author_user_id: "ocfo",
      visibility: "REQUESTER_VISIBLE",
      body: "Please replace the invoice and add the participant list.",
      created_at: "2026-10-03T00:00:00Z",
    },
    ...(finance
      ? [
          {
            id: "internal",
            request_id: "request",
            author_user_id: "ocfo",
            visibility: "INTERNAL_OCFO",
            body: "Private review note",
            created_at: "2026-10-03T01:00:00Z",
          },
        ]
      : []),
  ];
  const tables: Record<string, any[]> = {
    departments,
    projects,
    requests: [selectedRequest],
    users: [
      {
        id: "applicant",
        full_name: "ACADS Officer",
        email: "officer@example.edu",
      },
      { id: "ocfo", full_name: "Kathryn", email: "ocfo@example.edu" },
      { id: "cfo", full_name: "AEA CFO", email: "cfo@example.edu" },
    ],
    request_comments: comments,
    request_status_history: [
      {
        id: "history",
        request_id: "request",
        to_status: selectedRequest.status,
        notes:
          selectedRequest.status === "NEEDS_REVISION"
            ? "Please replace the invoice and add the participant list."
            : null,
        created_at: "2026-10-02T00:00:00Z",
      },
    ],
    request_reviews: [
      {
        id: "review",
        request_id: "request",
        reviewer_user_id: "ocfo",
        review_status: "REVIEWED",
        recommendation: "APPROVE",
      },
      {
        id: "pending",
        request_id: "request",
        reviewer_user_id: "cfo",
        review_status: "PENDING_REVIEW",
        recommendation: "NONE",
      },
    ],
    request_document_checks: params.has("warnings")
      ? []
      : [
          {
            request_id: "request",
            document_requirement_id: "invoice",
            is_verified: true,
          },
        ],
    request_register_sync: [
      {
        request_id: "request",
        version: 1,
        synced_version: 1,
        last_error: null,
      },
    ],
    commitments: [],
    approvals: [],
    notifications: [],
    faq_guides: [],
    memberships: [],
    organization_settings: [],
    audit_logs: [],
    project_members: [],
    project_reports: [],
    fiscal_years: [selectedYear],
  };
  const db = {
    from(table: string) {
      let rows = tables[table] ?? [];
      const query: any = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] === value);
          return query;
        },
        neq(key: string, value: unknown) {
          rows = rows.filter((r) => r[key] !== value);
          return query;
        },
        in(key: string, values: unknown[]) {
          rows = rows.filter((r) => values.includes(r[key]));
          return query;
        },
        or() {
          return query;
        },
        order() {
          return query;
        },
        range(from: number, to: number) {
          rows = rows.slice(from, to + 1);
          return query;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return query;
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(resolve: (value: unknown) => void) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  return {
    db,
    user: {
      id: "applicant",
      email: "officer@example.edu",
      user_metadata: { full_name: "ACADS Officer" },
    },
    role,
    yearRole: role,
    year: selectedYear,
    activeYear: selectedYear,
    readOnly: selectedYear.is_closed,
    departments: finance ? departments : departments.slice(0, 1),
    requestTypes: types,
    requirements,
    projects: finance ? projects : projects.slice(0, 1),
    projectDepartments: [
      { project_id: "project", department_id: "acads" },
      ...(finance
        ? [{ project_id: "private-project", department_id: "crea" }]
        : []),
    ],
    requests: params.has("empty") ? [] : [selectedRequest],
    transactions: [],
    financials: [
      {
        department_id: "acads",
        current_budget: "100000.00",
        initial_approved_budget: "100000.00",
        actual_expenses: "35500.00",
        active_commitments: "12000.00",
        available_funds: "52500.00",
        actual_revenue: "3000.00",
      },
    ],
    issues: [],
    years: [selectedYear],
    memberships: [],
    yearMemberships: [],
  };
}
