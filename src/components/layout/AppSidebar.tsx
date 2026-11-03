import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { can, type Permission } from "@/domain/roles";
import { useSession } from "@/hooks/use-session";
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

interface NavItem {
  path: string;
  title: string;
  icon: typeof LayoutDashboard;
  group: "Overview" | "Operations" | "Administration" | "Oversight" | "Settings";
  permission: Permission;
}

const NAV_ITEMS: NavItem[] = [
  {
    path: "/",
    title: "Dashboard",
    icon: LayoutDashboard,
    group: "Overview",
    permission: "dashboard.view",
  },
  {
    path: "/ledger",
    title: "Ledger",
    icon: BookOpen,
    group: "Oversight",
    permission: "reports.view",
  },
  {
    path: "/forex",
    title: "Forex Bureau",
    icon: ArrowLeftRight,
    group: "Operations",
    permission: "forex.transact",
  },
  {
    path: "/mobile-money",
    title: "Mobile Money",
    icon: Smartphone,
    group: "Operations",
    permission: "momo.transact",
  },
  {
    path: "/cash",
    title: "Cash & Float",
    icon: Wallet,
    group: "Operations",
    permission: "cash.manage",
  },
  {
    path: "/customers",
    title: "Customers",
    icon: Users,
    group: "Operations",
    permission: "customers.view",
  },
  {
    path: "/employees",
    title: "Employees",
    icon: IdCard,
    group: "Administration",
    permission: "employees.manage",
  },
  {
    path: "/branches",
    title: "Branches",
    icon: Building2,
    group: "Administration",
    permission: "branches.manage",
  },
  {
    path: "/expenses",
    title: "Expenses & Finance",
    icon: Receipt,
    group: "Administration",
    permission: "expenses.manage",
  },
  {
    path: "/reports",
    title: "Reports",
    icon: FileBarChart,
    group: "Oversight",
    permission: "reports.view",
  },
  {
    path: "/audit",
    title: "Audit Trail",
    icon: ShieldCheck,
    group: "Oversight",
    permission: "audit.view",
  },
  {
    path: "/settings",
    title: "Settings",
    icon: Settings,
    group: "Administration",
    permission: "settings.manage",
  },
];

const GROUPS = ["Overview", "Operations", "Administration", "Oversight", "Settings"] as const;

export function AppSidebar() {
  const { viewer, signOut } = useSession();

  const visibleModules = NAV_ITEMS.filter((item) => {
    if (!viewer) return false;
    return can(viewer.roles, item.permission);
  });

  const groups = GROUPS.filter((group) => visibleModules.some((item) => item.group === group));

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-muted/20">
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-semibold">
            FD
          </div>
          <div className="leading-tight">
            <h2 className="font-semibold text-base">FinDesk</h2>
            <p className="text-xs text-muted-foreground">Forex &amp; Mobile Money</p>
          </div>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        {groups.map((group) => (
          <div key={group} className="mb-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group}
            </p>
            <div className="space-y-0.5">
              {visibleModules
                .filter((item) => item.group === group)
                .map((item) => (
                  <SidebarLink key={item.path} item={item} />
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        {viewer ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {viewer.displayName?.[0] ?? viewer.email?.[0] ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{viewer.displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{viewer.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full cursor-pointer items-center justify-between rounded-md text-muted-foreground hover:bg-muted/80 px-2 py-1.5 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs">Sign out</span>
              </span>
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="flex w-full items-center justify-between rounded-md bg-primary/5 px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <span>Sign in</span>
          </Link>
        )}
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.path}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        "text-muted-foreground hover:bg-muted/80",
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.title}
    </Link>
  );
}
