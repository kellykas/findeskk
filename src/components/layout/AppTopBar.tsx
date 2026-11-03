import type { ReactNode } from "react";
import { Bell, Search } from "lucide-react";
import { useSession } from "@/hooks/use-session";

export function AppTopBar({ menuButton }: { menuButton?: ReactNode }) {
  const { viewer } = useSession();
  const name = viewer?.displayName?.trim() || viewer?.email || "Staff";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FD";

  return (
    <header className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      {menuButton}

      <div className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search"
          placeholder="Search FinDesk…"
          className="h-10 w-full rounded-full border border-border/70 bg-muted/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/10"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>

        <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card py-1 pl-1 pr-1 sm:pr-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="max-w-[150px] truncate text-xs font-semibold">{name}</div>
            <div className="max-w-[150px] truncate text-[11px] text-muted-foreground">
              {viewer?.email ?? "Not signed in"}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
