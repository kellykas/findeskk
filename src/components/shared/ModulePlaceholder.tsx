import { getModule, type AppModule } from "@/config/modules";
import { AppShell } from "@/components/layout/AppShell";
import { AccessDenied, PageHeader, SectionCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { can } from "@/domain/access";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";

/** Honest placeholder for modules not built yet — no simulated operations. */
export function ModulePlaceholder({ path }: { path: AppModule["path"] }) {
  const { viewer } = useSession();
  const { t } = useLanguage();
  const m = getModule(path);
  const allowed = viewer ? can(viewer.roles, m.permission) : false;

  return (
    <AppShell>
      <PageHeader
        title={t(m.title)}
        description={t(m.description)}
        actions={
          <Badge variant="secondary">{t("Planned · Phase {phase}", { phase: m.phase })}</Badge>
        }
      />
      {!allowed ? (
        <AccessDenied
          title={t("This module is restricted")}
          description={t(
            "Your current roles do not include access to this module. Ask a super admin or the company owner to review your roles.",
          )}
        />
      ) : (
        <>
          <SectionCard title={t("Planned capabilities")}>
            <ul className="divide-y text-sm">
              {m.plannedFeatures.map((f) => (
                <li key={f} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  {t(f)}
                </li>
              ))}
            </ul>
          </SectionCard>
          <p className="mt-4 text-xs text-muted-foreground">
            {t(
              "This module is not yet operational. No transactions can be recorded here until its phase is delivered on top of the accounting ledger.",
            )}
          </p>
        </>
      )}
    </AppShell>
  );
}
