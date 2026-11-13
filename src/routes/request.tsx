import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { BrandMark } from "@/components/auth/BrandMark";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useBranding } from "@/hooks/use-branding";
import { useLanguage } from "@/hooks/use-language";

/**
 * Public shell for the service request pages. It deliberately sits outside
 * AppShell: a customer with no account must never be sent to the sign-in screen.
 */
export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: "Request a service — FinDesk" },
      {
        name: "description",
        content:
          "Ask for foreign exchange, mobile money or account help and follow the answer in one thread.",
      },
      { property: "og:title", content: "Request a service — FinDesk" },
      {
        property: "og:description",
        content:
          "Ask for foreign exchange, mobile money or account help and follow the answer in one thread.",
      },
    ],
  }),
  component: RequestLayout,
});

function RequestLayout() {
  const { t } = useLanguage();
  const { appName } = useBranding();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/request" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight">{appName}</span>
          </Link>
          <LanguageToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">
        {t("Replies come from the branch team during working hours.")}
      </footer>
    </div>
  );
}
