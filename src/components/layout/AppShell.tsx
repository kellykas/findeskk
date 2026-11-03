import { ReactNode, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSession } from "@/hooks/use-session";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const { status } = useSession();
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => setOpen(false), [pathname]);

  let body: ReactNode = children ?? <Outlet />;
  if (status === "loading" || status === "loading_viewer") {
    body = <p className="p-6 text-sm text-muted-foreground">Loading your workspace…</p>;
  } else if (status === "signed_out") {
    body = (
      <div className="mx-auto mt-12 max-w-sm rounded-lg border border-border bg-card p-6 text-center">
        <h2 className="text-lg font-semibold">Sign in to FinDesk</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Staff access only. Sign in with the account your administrator created.
        </p>
        <Button asChild className="mt-4 w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <div className="hidden w-64 shrink-0 md:block">
        <AppSidebar />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopBar
          menuButton={
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          }
        />
        <main className="min-w-0 flex-1 overflow-auto p-4 lg:p-6">{body}</main>
      </div>
    </div>
  );
}
