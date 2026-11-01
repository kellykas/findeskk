/**
 * Role and permission vocabulary shared by UI and (later) the database.
 *
 * IMPORTANT: The frontend uses these only to shape the interface. Real
 * enforcement happens in PostgreSQL via RLS and security-definer functions
 * (Phase 2). Never treat a client-side check as authorization.
 */
export const ROLES = [
  "super_admin",
  "company_owner",
  "general_manager",
  "branch_manager",
  "supervisor",
  "forex_teller",
  "mobile_money_teller",
  "accountant",
  "auditor",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  company_owner: "Company Owner",
  general_manager: "General Manager",
  branch_manager: "Branch Manager",
  supervisor: "Supervisor",
  forex_teller: "Forex Teller",
  mobile_money_teller: "Mobile Money Teller",
  accountant: "Accountant",
  auditor: "Auditor",
};

export type Permission =
  | "dashboard.view"
  | "forex.transact"
  | "forex.rates.manage"
  | "momo.transact"
  | "cash.manage"
  | "transactions.approve"
  | "transactions.reverse"
  | "customers.view"
  | "employees.manage"
  | "branches.manage"
  | "expenses.manage"
  | "reports.view"
  | "audit.view"
  | "settings.manage";
