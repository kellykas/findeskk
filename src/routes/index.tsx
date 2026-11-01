import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable, DemoBadge, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { formatMoney, type Money } from "@/domain/money";
import { dashboardQuery, type RecentTransaction } from "@/services/dashboard.service";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — FinDesk" },
      { name: "description", content: "Cash, foreign currency and mobile money float overview across all branches." },
      { property: "og:title", content: "Dashboard — FinDesk" },
      { property: "og:description", content: "Cash, foreign currency and mobile money float overview across all branches." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: Dashboard,
});

const TYPE_LABELS: Record<RecentTransaction["type"], string> = {
  forex_buy: "Forex buy",
  forex_sell: "Forex sell",
  momo_deposit: "MoMo deposit",
  momo_withdrawal: "MoMo withdrawal",
};

const fmt = (v: Money | number) => (typeof v === "number" ? v.toLocaleString("en-UG") : formatMoney(v));

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const cash = data.balances.filter((b) => b.kind === "physical_cash");
  const float = data.balances.filter((b) => b.kind === "electronic_float");

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Company-wide position across all branches."
        actions={data.source === "demo" ? <DemoBadge /> : undefined}
      />
      {data.source === "demo" && (
        <div className="mb-6 rounded-md border border-warning bg-warning/10 px-4 py-3 text-sm">
          Figures below are demonstration data. Live, ledger-derived balances arrive with the accounting engine.
        </div>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Physical cash</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cash.map((b) => <StatCard key={b.label} label={b.label} value={formatMoney(b.amount)} />)}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Electronic float</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {float.map((b) => <StatCard key={b.label} label={b.label} value={formatMoney(b.amount)} />)}
        {data.kpis.slice(0, 2).map((k) => <StatCard key={k.label} label={k.label} value={fmt(k.value)} />)}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.kpis.slice(2).map((k) => <StatCard key={k.label} label={k.label} value={fmt(k.value)} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionCard title="Recent transactions">
            <DataTable
              rows={data.recent}
              rowKey={(r) => r.reference}
              columns={[
                { header: "Ref", cell: (r) => <span className="tabular text-xs">{r.reference}</span> },
                { header: "Type", cell: (r) => TYPE_LABELS[r.type] },
                { header: "Branch", cell: (r) => r.branch },
                { header: "Teller", cell: (r) => r.teller },
                { header: "Amount", align: "right", cell: (r) => <span className="tabular">{formatMoney(r.amount)}</span> },
                {
                  header: "Status",
                  cell: (r) => (
                    <Badge variant="outline" className="font-normal">
                      {r.verification === "manual" ? "Manually recorded" : "Network verified"}
                    </Badge>
                  ),
                },
                { header: "Time", align: "right", cell: (r) => <span className="tabular text-muted-foreground">{r.time}</span> },
              ]}
            />
          </SectionCard>
        </div>
        <SectionCard title="Branch performance">
          <DataTable
            rows={data.branches}
            rowKey={(r) => r.name}
            columns={[
              { header: "Branch", cell: (r) => r.name },
              { header: "Txns", align: "right", cell: (r) => <span className="tabular">{r.transactions}</span> },
              { header: "Volume", align: "right", cell: (r) => <span className="tabular">{formatMoney(r.volume)}</span> },
            ]}
          />
        </SectionCard>
      </div>
    </AppShell>
  );
}
