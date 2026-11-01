import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, LogOut } from "lucide-react";
import { MODULES, type AppModule } from "@/config/modules";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const GROUPS: AppModule["group"][] = ["Overview", "Operations", "Administration", "Oversight"];

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-sidebar-primary font-mono text-sm font-semibold text-sidebar-primary-foreground">
        FD
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-wide text-sidebar-primary">FinDesk</div>
        <div className="text-[11px] text-sidebar-foreground/70">Forex & Mobile Money</div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-6">
      {GROUPS.map((group) => (
        <div key={group} className="mt-4">
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            {group}
          </div>
          {MODULES.filter((m) => m.group === group).map((m) => (
            <Link
              key={m.path}
              to={m.path}
              onClick={onNavigate}
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <m.icon className="h-4 w-4 shrink-0" />
              {m.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <Brand />
      <NavList onNavigate={onNavigate} />
      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/login"
          className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <SidebarBody />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-card px-4 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">All branches</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <div className="hidden text-right leading-tight sm:block">
              <div className="font-medium">Signed out</div>
              <div className="text-xs text-muted-foreground">Authentication in Phase 2</div>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
