/**
 * Permission vocabulary and the role -> permission matrix.
 *
 * These checks shape the interface only. Authorization is enforced by
 * PostgreSQL RLS and the security-definer functions in supabase/migrations;
 * never treat a client-side check as authorization.
 */
import type { Permission, Role } from "./roles";

export const PERMISSIONS: readonly Permission[] = [
  "dashboard.view",
  "forex.transact",
  "forex.rates.manage",
  "momo.transact",
  "cash.manage",
  "transactions.approve",
  "transactions.reverse",
  "customers.view",
  "employees.manage",
  "branches.manage",
  "expenses.manage",
  "reports.view",
  "audit.view",
  "settings.manage",
];

const ALL = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: ALL,
  company_owner: ALL,
  general_manager: [
    "dashboard.view",
    "forex.transact",
    "forex.rates.manage",
    "momo.transact",
    "cash.manage",
    "transactions.approve",
    "transactions.reverse",
    "customers.view",
    "expenses.manage",
    "reports.view",
    "audit.view",
  ],
  branch_manager: [
    "dashboard.view",
    "forex.transact",
    "forex.rates.manage",
    "momo.transact",
    "cash.manage",
    "transactions.approve",
    "customers.view",
    "reports.view",
  ],
  supervisor: [
    "dashboard.view",
    "forex.transact",
    "momo.transact",
    "cash.manage",
    "transactions.approve",
    "customers.view",
    "reports.view",
  ],
  forex_teller: ["dashboard.view", "forex.transact", "customers.view"],
  mobile_money_teller: ["dashboard.view", "momo.transact", "customers.view"],
  accountant: ["dashboard.view", "expenses.manage", "reports.view", "audit.view"],
  auditor: ["dashboard.view", "reports.view", "audit.view"],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/**
 * Mirrors public.is_staff_admin() in the database: staff and branch
 * administration is limited to super admins and the company owner.
 */
export function isStaffAdmin(roles: readonly Role[]): boolean {
  return roles.includes("super_admin") || roles.includes("company_owner");
}
