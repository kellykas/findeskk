import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { AccessDenied, DataTable, PageHeader, SectionCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/roles";
import { useSession } from "@/hooks/use-session";
import { auditEventsQuery, type AuditEvent } from "@/services/audit.service";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Trail — FinDesk" },
      { name: "description", content: "Immutable record of sensitive FinDesk actions." },
      { property: "og:title", content: "Audit Trail — FinDesk" },
      { property: "og:description", content: "Immutable record of sensitive FinDesk actions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Audit,
});

const AREAS: Record<string, string> = {
  profiles: "Staff",
  user_roles: "Roles",
  branches: "Branches",
  branch_assignments: "Branch access",
  accounts: "Chart of accounts",
  journal_entries: "Journal",
  customers: "Customers",
  momo_transactions: "Mobile money",
  fx_rates: "Exchange rates",
  fx_transactions: "Forex",
  company_settings: "Settings",
  expenses: "Expenses",
};

const ACTIONS: Record<string, string> = { INSERT: "Created", UPDATE: "Changed", DELETE: "Removed" };

function Audit() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "audit.view"));
  const [area, setArea] = useState<string | undefined>();
  const events = useQuery({ ...auditEventsQuery(200, area), enabled: allowed });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title={t("Audit Trail")} description={t("Who changed what, and when.")} />
        <AccessDenied
          title={t("The audit trail is restricted")}
          description={t(
            "Oversight roles can read the audit trail. Ask a super admin or the company owner for access.",
          )}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={t("Audit Trail")}
        description={t("Every change is recorded automatically and cannot be edited.")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void events.refetch()}
            disabled={events.isFetching}
          >
            Refresh
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={area ? "outline" : "default"} onClick={() => setArea(undefined)}>
          All
        </Button>
        {Object.entries(AREAS).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={area === key ? "default" : "outline"}
            onClick={() => setArea(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <SectionCard title={t("Recent activity")}>
        {events.isPending ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading audit trail…</p>
        ) : events.isError ? (
          <p className="px-4 py-6 text-sm text-destructive">
            Could not load the audit trail: {events.error.message}
          </p>
        ) : events.data.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No recorded changes yet.</p>
        ) : (
          <DataTable<AuditEvent>
            rows={events.data}
            rowKey={(r) => String(r.id)}
            columns={[
              { header: "When", cell: (r) => new Date(r.occurredAt).toLocaleString() },
              { header: "Area", cell: (r) => AREAS[r.table] ?? r.table },
              {
                header: "Action",
                cell: (r) => <Badge variant="outline">{ACTIONS[r.action] ?? r.action}</Badge>,
              },
              {
                header: "Record",
                cell: (r) => (
                  <span className="font-mono text-xs">{r.recordId?.slice(0, 8) ?? "—"}</span>
                ),
              },
              {
                header: "By",
                cell: (r) => (
                  <span className="font-mono text-xs">
                    {r.actorId ? r.actorId.slice(0, 8) : "System"}
                  </span>
                ),
              },
            ]}
          />
        )}
      </SectionCard>
    </AppShell>
  );
}
