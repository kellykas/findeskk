import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { MODULES, type AppModule } from "@/config/modules";
import { can } from "@/domain/roles";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export function AppTopBar({ menuButton }: { menuButton?: ReactNode }) {
  const { viewer } = useSession();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const name = viewer?.displayName?.trim() || viewer?.email || t("Staff");
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "FD";

  // Searches the pages this viewer may open: the module registry is the single
  // source of truth, so a new module is searchable the moment it is declared.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !viewer) return [];
    return MODULES.filter(
      (module) =>
        can(viewer.roles, module.permission) &&
        [module.title, module.description, module.path].join(" ").toLowerCase().includes(needle),
    ).slice(0, 6);
  }, [query, viewer]);

  function go(path: AppModule["path"]) {
    setQuery("");
    setOpen(false);
    void navigate({ to: path });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const first = matches[0];
    if (first) go(first.path);
  }

  const showResults = open && query.trim().length > 0;

  return (
    <header className="flex items-center gap-2 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
      {menuButton}

      <form
        onSubmit={handleSubmit}
        role="search"
        className="relative hidden min-w-0 flex-1 sm:block sm:max-w-xs"
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label={t("Search pages")}
          placeholder={t("Search pages…")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
          className="h-10 w-full rounded-full border border-border/70 bg-muted/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/10"
        />

        {showResults && (
          <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg">
            {matches.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                {t("No page matches “{query}”.", { query: query.trim() })}
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {matches.map((module) => (
                  <li key={module.path}>
                    <Link
                      to={module.path}
                      // Keep focus so the click is not swallowed by the blur handler.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setQuery("");
                        setOpen(false);
                      }}
                      activeProps={{ className: "bg-muted" }}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted",
                      )}
                    >
                      <module.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block font-medium leading-tight">{t(module.title)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t(module.description)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-card py-1 pl-1 pr-1 sm:pr-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="max-w-[150px] truncate text-xs font-semibold">{name}</div>
            <div className="max-w-[150px] truncate text-[11px] text-muted-foreground">
              {viewer?.email ?? t("Not signed in")}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
