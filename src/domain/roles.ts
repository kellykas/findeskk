/**
 * Role and permission vocabulary shared by the interface and the database.
 *
 * IMPORTANT: the frontend uses these only to shape the interface. Real
 * enforcement happens in PostgreSQL via RLS and security-definer functions
 * (see supabase/migrations). Never treat a client-side check as authorization.
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

export const PERMISSIONS = [
  "dashboard.view",
  "forex.transact",
  "forex.transfer",
  "forex.rates.manage",
  "momo.transact",
  "cash.manage",
  "transactions.approve",
  "transactions.reverse",
  "customers.view",
  "customers.manage",
  "employees.manage",
  "branches.manage",
  "expenses.manage",
  "reports.view",
  "audit.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permission matrix. This is the single definition used by navigation,
 * page guards and the Settings permission preview.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  company_owner: PERMISSIONS,
  general_manager: [
    "dashboard.view",
    "forex.transact",
    "forex.transfer",
    "forex.rates.manage",
      "momo.transact",
    "cash.manage",
    "transactions.approve",
    "transactions.reverse",
    "customers.view",
    "customers.manage",
    "expenses.manage",
    "reports.view",
    "audit.view",
  ],
  branch_manager: [
    "dashboard.view",
    "forex.transact",
    "forex.transfer",
    "forex.rates.manage",
      "momo.transact",
    "cash.manage",
    "transactions.approve",
    "customers.view",
    "customers.manage",
    "reports.view",
  ],
  supervisor: [
    "dashboard.view",
    "forex.transact",
    "forex.transfer",
      "momo.transact",
    "cash.manage",
    "transactions.approve",
    "customers.view",
    "customers.manage",
    "reports.view",
  ],
  forex_teller: ["dashboard.view", "forex.transact", "customers.view"],
  mobile_money_teller: ["dashboard.view", "momo.transact", "customers.view", "customers.manage"],
  accountant: ["dashboard.view", "expenses.manage", "customers.view", "reports.view", "audit.view"],
  auditor: ["dashboard.view", "reports.view", "audit.view"],
};

/**
 * UI-level permission check only.
 *
 * IMPORTANT: cosmetic. RLS and security-definer functions enforce access; a
 * client can always fake roles or skip the check.
 */
export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => (ROLE_PERMISSIONS[role] ?? []).includes(permission));
}

export function isStaffAdmin(roles: readonly Role[]): boolean {
  return roles.includes("super_admin") || roles.includes("company_owner");
}
