/**
 * Single source of truth for application modules: navigation, page headers
 * and the phased roadmap. Add a module here before creating its route.
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BookOpen,
  ArrowLeftRight,
  Smartphone,
  Wallet,
  Users,
  IdCard,
  Building2,
  Receipt,
  FileBarChart,
  ShieldCheck,
  Settings,
} from "lucide-react";
import type { Permission } from "@/domain/roles";

export interface AppModule {
  path:
    | "/"
    | "/forex"
    | "/mobile-money"
    | "/cash"
    | "/customers"
    | "/employees"
    | "/branches"
    | "/ledger"
    | "/expenses"
    | "/reports"
    | "/audit"
    | "/settings";
  title: string;
  description: string;
  icon: LucideIcon;
  group: "Overview" | "Operations" | "Administration" | "Oversight";
  permission: Permission;
  /** Development phase in which the module becomes functional. */
  phase: number;
  plannedFeatures: string[];
}

export const MODULES: AppModule[] = [
  {
    path: "/",
    title: "Dashboard",
    description: "Company-wide cash, float and performance overview.",
    icon: LayoutDashboard,
    group: "Overview",
    permission: "dashboard.view",
    phase: 3,
    plannedFeatures: [],
  },
  {
    path: "/forex",
    title: "Forex Bureau",
    description: "Buy and sell foreign currency, manage rates and inventory.",
    icon: ArrowLeftRight,
    group: "Operations",
    permission: "forex.transact",
    phase: 4,
    plannedFeatures: [
      "Buy and sell foreign currency",
      "Configurable buying and selling rates with history",
      "Foreign currency inventory per branch",
      "Cost basis and forex profit tracking",
      "Inter-branch currency transfers",
      "Receipts",
    ],
  },
  {
    path: "/mobile-money",
    title: "Mobile Money",
    description: "Manual recording of MTN and Airtel agency transactions.",
    icon: Smartphone,
    group: "Operations",
    permission: "momo.transact",
    phase: 5,
    plannedFeatures: [
      "MTN and Airtel deposits and withdrawals",
      "Network reference capture (manually recorded, not network-verified)",
      "Service charges and commissions",
      "Float movements per network",
      "Authorized reversals",
    ],
  },
  {
    path: "/cash",
    title: "Cash & Float",
    description: "Tills, safes, float top-ups, transfers and reconciliation.",
    icon: Wallet,
    group: "Operations",
    permission: "cash.manage",
    phase: 6,
    plannedFeatures: [
      "Teller tills and branch safes",
      "Opening and closing balances",
      "Float top-ups and inter-branch transfers",
      "Shortages, surpluses and reconciliation",
      "Approval workflows",
    ],
  },
  {
    path: "/customers",
    title: "Customers",
    description: "Customer records, identification and history.",
    icon: Users,
    group: "Operations",
    permission: "customers.view",
    phase: 4,
    plannedFeatures: [
      "Customer profiles and references",
      "Identification details where legally required",
      "Transaction history",
      "Restricted access to personal data",
    ],
  },
  {
    path: "/employees",
    title: "Employees",
    description: "Staff profiles, roles and branch assignments.",
    icon: IdCard,
    group: "Administration",
    permission: "employees.manage",
    phase: 2,
    plannedFeatures: [
      "Employee profiles and account status",
      "Role and permission assignment",
      "Single or multi-branch assignments",
      "Activity history",
    ],
  },
  {
    path: "/branches",
    title: "Branches",
    description: "Branch profiles, accounts and performance.",
    icon: Building2,
    group: "Administration",
    permission: "branches.manage",
    phase: 2,
    plannedFeatures: [
      "Branch profiles",
      "Branch cash, currency and float accounts",
      "Branch employees",
      "Branch performance",
    ],
  },
  {
    path: "/expenses",
    title: "Expenses & Finance",
    description: "Expenses, approvals, income and profit & loss.",
    icon: Receipt,
    group: "Administration",
    permission: "expenses.manage",
    phase: 8,
    plannedFeatures: [
      "Expenses with categories and approvals",
      "Income and commissions",
      "Financial summaries",
      "Profit and loss",
    ],
  },
  {
    path: "/ledger",
    title: "Ledger",
    description: "Chart of accounts, trial balance and posted journal entries.",
    icon: BookOpen,
    group: "Oversight",
    permission: "reports.view",
    phase: 3,
    plannedFeatures: [],
  },
  {
    path: "/reports",
    title: "Reports",
    description: "Ledger-reconciled operational and financial reports.",
    icon: FileBarChart,
    group: "Oversight",
    permission: "reports.view",
    phase: 8,
    plannedFeatures: [
      "Daily transactions, forex and mobile money reports",
      "Branch and teller performance",
      "Cash reconciliation and reversals",
      "Filters by date, branch, employee, currency and type",
      "PDF and Excel export",
    ],
  },
  {
    path: "/audit",
    title: "Audit Trail",
    description: "Immutable record of sensitive actions.",
    icon: ShieldCheck,
    group: "Oversight",
    permission: "audit.view",
    phase: 3,
    plannedFeatures: [
      "Who, what, when and which branch",
      "Approval details",
      "Previous and new values",
      "Read-only access for auditors",
    ],
  },
  {
    path: "/settings",
    title: "Settings",
    description: "Company profile, currencies and permissions.",
    icon: Settings,
    group: "Administration",
    permission: "settings.manage",
    phase: 2,
    plannedFeatures: [
      "Company profile and logo",
      "Configurable currencies",
      "Role permission matrix",
      "Receipt formats (58mm, 80mm, A4)",
    ],
  },
];

export function getModule(path: AppModule["path"]): AppModule {
  const m = MODULES.find((x) => x.path === path);
  if (!m) throw new Error(`Unknown module ${path}`);
  return m;
}
