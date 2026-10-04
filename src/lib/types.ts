export type Role =
  "CFO_ADMIN" | "OCFO_MEMBER" | "DEPARTMENT_MEMBER" | "PROJECT_MEMBER";
export const statuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_OCFO_REVIEW",
  "NEEDS_REVISION",
  "READY_FOR_CFO",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;
export type Status = (typeof statuses)[number];
export interface Year {
  id: string;
  label: string;
  code: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
}
export interface Department {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}
export interface Membership {
  id: string;
  email: string;
  user_id: string | null;
  fiscal_year_id: string;
  department_id: string;
  role: Role;
  is_active: boolean;
}
export interface RequestType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  creates_commitment: boolean;
  process_config: Record<string, unknown>;
}
export interface Requirement {
  id: string;
  request_type_id: string;
  document_code: string;
  label: string;
  is_required: boolean;
  condition_type: string | null;
  condition_json: { amount?: number } | null;
  display_order: number;
  template_url?: string | null;
}
export interface FinanceRequest {
  id: string;
  reference_code: string | null;
  fiscal_year_id: string;
  department_id: string;
  project_id: string | null;
  request_type_id: string;
  requester_user_id: string;
  title: string;
  amount: string;
  notes: string | null;
  relevant_date: string | null;
  status: Status;
  source_folder_url: string | null;
  source_folder_id: string | null;
  created_at: string;
  submitted_at: string | null;
  updated_at?: string;
}
export interface Project {
  id: string;
  fiscal_year_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}
export interface Financial {
  department_id: string;
  fiscal_year_id: string;
  initial_approved_budget: string;
  current_budget: string;
  adjustments: string;
  actual_expenses: string;
  actual_revenue: string;
  active_commitments: string;
  available_funds: string;
}
export interface Transaction {
  verified_by?: string | null;
  id: string;
  fiscal_year_id: string;
  department_id: string;
  project_id: string | null;
  request_id: string | null;
  type: "EXPENSE" | "REVENUE";
  amount: string;
  transaction_date: string;
  description: string;
  created_at: string;
}
export interface Issue {
  id: string;
  fiscal_year_id: string;
  department_id: string;
  code: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  description: string;
  status: string;
  detected_at: string;
  resolution_notes: string | null;
}
