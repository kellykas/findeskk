import { getModule, type AppModule } from "@/config/modules";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, SectionCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";

/** Honest placeholder for modules not built yet — no simulated operations. */
export function ModulePlaceholder({ path }: { path: AppModule["path"] }) {
  const m = getModule(path);
  return (
    <AppShell>
      <PageHeader title={m.title} description={m.description} actions={<Badge variant="secondary">Planned · Phase {m.phase}</Badge>} />
      <SectionCard title="Planned capabilities">
        <ul className="divide-y text-sm">
          {m.plannedFeatures.map((f) => (
            <li key={f} className="flex items-center gap-3 px-4 py-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
              {f}
            </li>
          ))}
        </ul>
      </SectionCard>
      <p className="mt-4 text-xs text-muted-foreground">
        This module is not yet operational. No transactions can be recorded here until its phase is delivered on top of the
        accounting ledger.
      </p>
    </AppShell>
  );
}
