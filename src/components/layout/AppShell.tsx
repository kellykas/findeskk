import { ReactNode, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const { status } = useSession();
  const { t } = useLanguage();
  const pathname = useLocation({ select: (l) => l.pathname });
  useEffect(() => setOpen(false), [pathname]);

  // Without a session there is nothing to show, so go to the sign-in page. This
  // covers signing out as well as opening a protected page while signed out, and
  // it replaces the history entry so Back does not return to a signed-out shell.
  if (status === "signed_out") return <Navigate to="/login" replace />;

  const body: ReactNode =
    status === "loading" || status === "loading_viewer" ? (
      <p className="p-6 text-sm text-muted-foreground">{t("Loading your workspace…")}</p>
    ) : (
      (children ?? <Outlet />)
    );

  return (
    <div className="app-canvas min-h-dvh p-2 sm:p-4 lg:p-6">
      <div className="app-shell mx-auto flex h-[calc(100dvh-1rem)] max-w-[1500px] overflow-hidden rounded-[26px] border border-white/60 bg-card sm:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)] lg:rounded-[30px]">
        <div className="hidden w-[236px] shrink-0 md:block">
          <AppSidebar />
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-[268px] p-0">
            <SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
            <AppSidebar />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopBar
            menuButton={
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full md:hidden"
                aria-label={t("Open menu")}
                onClick={() => setOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
          <main className="min-w-0 flex-1 overflow-auto px-4 pb-8 pt-1 sm:px-6 lg:px-8">
            {body}
          </main>
        </div>
      </div>
    </div>
  );
}
