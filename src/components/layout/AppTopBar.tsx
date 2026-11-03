import { useMatch } from "@tanstack/react-router";
import { MODULES, type AppModule } from "@/config/modules";

export function AppTopBar() {
  const match = useMatch({ strict: false });
  const route = match?.routeId;

  const module =
    route && route.startsWith("/")
      ? MODULES.find((m) => m.path === (route as AppModule["path"]))
      : undefined;

  return (
    <header className="border-b border-border bg-muted/20 px-4">
      <div className="flex items-center gap-4 py-3">
        {module ? (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">
              {module.title[0]}
            </div>
            <div>
              <h1 className="text-sm font-semibold">{module.title}</h1>
              <p className="text-xs text-muted-foreground">{module.description}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs text-primary">
              FD
            </div>
            <div>
              <h1 className="text-sm font-semibold">FinDesk</h1>
              <p className="text-xs text-muted-foreground">Forex &amp; Mobile Money</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
