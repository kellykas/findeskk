import type { ReactNode } from "react";
import { useMatch } from "@tanstack/react-router";
import { MODULES, type AppModule } from "@/config/modules";

export function AppTopBar({ menuButton }: { menuButton?: ReactNode }) {
  const match = useMatch({ strict: false });
  const route = match?.routeId;

  const module =
    route && route.startsWith("/")
      ? MODULES.find((m) => m.path === (route as AppModule["path"]))
      : undefined;

  const title = module?.title ?? "FinDesk";
  const description = module?.description ?? "Forex & Mobile Money";

  return (
    <header className="border-b border-border bg-muted/20 px-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 py-3">
        {menuButton}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">
          {module ? title[0] : "FD"}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </header>
  );
}
