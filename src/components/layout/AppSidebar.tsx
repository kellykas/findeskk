import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

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
  Receipt,
  FileBarChart,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";

interface NavItem {
  path: string;
  title: string;
  icon: typeof LayoutDashboard;
  group: "Overview" | "Operations" | "Administration" | "Oversight";
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

const GROUPS = ["Overview", "Operations", "Administration", "Oversight"] as const;

const THEME_KEY = "findesk-theme";

export function AppSidebar() {
  const { viewer, signOut } = useSession();

  const visibleModules = NAV_ITEMS.filter((item) =>
    viewer ? can(viewer.roles, item.permission) : false,
  );
  const groups = GROUPS.filter((group) => visibleModules.some((item) => item.group === group));

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.48_0.2_280)] text-sm font-bold text-primary-foreground shadow-sm">
          FD
        </div>
        <div className="leading-tight">
          <h2 className="text-base font-semibold tracking-tight">FinDesk</h2>
          <p className="text-[11px] text-muted-foreground">Forex &amp; Mobile Money</p>
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2">
        {groups.map((group) => (
          <div key={group} className="mb-3">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
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

      <div className="space-y-2 border-t border-border/70 p-3">
        {viewer ? (
          <>
            <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {viewer.displayName?.[0] ?? viewer.email?.[0] ?? "U"}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-xs font-semibold">{viewer.displayName}</div>
                <div className="truncate text-[11px] text-muted-foreground">{viewer.email}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="flex w-full items-center justify-center rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        )}

        <ThemeToggle />
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.path}
      activeOptions={{ exact: item.path === "/" }}
      activeProps={{
        className:
          "bg-primary text-primary-foreground shadow-[0_8px_20px_-10px_oklch(0.58_0.19_296/0.9)] hover:bg-primary",
      }}
      inactiveProps={{ className: "text-muted-foreground hover:bg-muted hover:text-foreground" }}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors [&.active]:font-semibold",
      )}
    >
      <item.icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

/**
 * Light/dark switch. The chosen theme is remembered locally; the database is
 * never involved because this is a display preference, not company data.
 */
function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const next = stored ? stored === "dark" : prefersDark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }, []);

  function choose(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-muted p-1">
      <button
        type="button"
        aria-label="Light theme"
        aria-pressed={!dark}
        onClick={() => choose(false)}
        className={cn(
          "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full transition-colors",
          dark ? "text-muted-foreground hover:text-foreground" : "bg-card text-primary shadow-sm",
        )}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        aria-pressed={dark}
        onClick={() => choose(true)}
        className={cn(
          "flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full transition-colors",
          dark ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}
