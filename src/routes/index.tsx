import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPE_LABELS } from "@/domain/ledger";
import { formatMoney, type Money } from "@/domain/money";
import { useSession } from "@/hooks/use-session";
import { dashboardQuery } from "@/services/dashboard.service";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — FinDesk" },
      {
        name: "description",
        content: "Cash, foreign currency and mobile money float overview across all branches.",
      },
      { property: "og:title", content: "Dashboard — FinDesk" },
      {
        property: "og:description",
        content: "Cash, foreign currency and mobile money float overview across all branches.",
      },
    ],
  }),
  component: Dashboard,
});

const fmt = (amount: Money) => formatMoney(amount);

function Dashboard() {
  const { status } = useSession();

  // AppShell renders the loading state or the sign-in/access gate; querying the
  // ledger only makes sense once a real session exists.
  if (status !== "signed_in") return <AppShell>{null}</AppShell>;

  return <DashboardContent />;
}

function DashboardContent() {
  const { data, isPending, isError, error, isFetching, refetch } = useQuery(dashboardQuery);

  if (isPending) {
    return (
      <AppShell>
        <PageHeader
          title="Dashboard"
          description="Company-wide position, derived from the ledger."
        />
        <p className="text-sm text-muted-foreground">Loading ledger balances…</p>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <PageHeader
          title="Dashboard"
          description="Company-wide position, derived from the ledger."
        />
        <SectionCard title="Balances unavailable">
          <div className="space-y-3 px-4 py-6 text-sm">
            <p className="text-destructive">
              Could not read ledger balances:{" "}
              {error instanceof Error ? error.message : "unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        </SectionCard>
      </AppShell>
    );
  }

  const cashTotal = data.cash.reduce((total, line) => total + line.amount.minor, 0n);
  const totalFor = (type: "asset" | "income" | "expense") =>
    data.totals.find((total) => total.type === type)?.amount ??
    ({ minor: 0n, currency: "UGX" } as Money);

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Company-wide position, derived from posted journal entries."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash & float" value={fmt({ minor: cashTotal, currency: "UGX" })} />
        <StatCard label="Total assets" value={fmt(totalFor("asset"))} />
        <StatCard label="Income (all time)" value={fmt(totalFor("income"))} />
        <StatCard label="Expenses (all time)" value={fmt(totalFor("expense"))} />
      </div>

      {!data.hasData && (
        <SectionCard title="No transactions posted yet">
          <div className="space-y-2 px-4 py-6 text-sm text-muted-foreground">
            <p>
              The ledger is empty, so every figure here is zero. Nothing on this page is simulated
              or estimated.
            </p>
            <p>
              Balances and activity appear as soon as the first journal entry is posted — an opening
              balance, or a transaction from the forex and mobile money modules once they are built.
            </p>
          </div>
        </SectionCard>
      )}

      {data.hasData && (
        <div className="space-y-6">
          <SectionCard title="Cash & float accounts">
            <DataTable
              rows={data.cash}
              rowKey={(line) => line.code}
              columns={[
                {
                  header: "Code",
                  cell: (line) => <span className="tabular text-xs font-medium">{line.code}</span>,
                },
                { header: "Account", cell: (line) => line.label },
                {
                  header: "Group",
                  cell: (line) => (
                    <Badge variant="secondary" className="font-normal">
                      {line.kind === "physical_cash"
                        ? "Physical cash"
                        : line.kind === "bank"
                          ? "Bank"
                          : "Electronic float"}
                    </Badge>
                  ),
                },
                {
                  header: "Balance",
                  align: "right",
                  cell: (line) => <span className="tabular">{fmt(line.amount)}</span>,
                },
              ]}
            />
          </SectionCard>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SectionCard title="Recent postings">
                {data.recent.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    No journal entries have been posted yet.
                  </p>
                ) : (
                  <DataTable
                    rows={data.recent}
                    rowKey={(journalEntry) => journalEntry.id}
                    columns={[
                      {
                        header: "Date",
                        cell: (journalEntry) => (
                          <span className="tabular text-xs">
                            {new Date(journalEntry.entryDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        ),
                      },
                      {
                        header: "Reference",
                        cell: (journalEntry) => (
                          <span className="tabular text-xs">{journalEntry.reference}</span>
                        ),
                      },
                      {
                        header: "Description",
                        cell: (journalEntry) => (
                          <div className="leading-tight">
                            <div>{journalEntry.description}</div>
                            {journalEntry.reversesEntryId && (
                              <div className="text-xs text-muted-foreground">Reversing entry</div>
                            )}
                          </div>
                        ),
                      },
                      {
                        header: "Lines",
                        align: "right",
                        cell: (journalEntry) => (
                          <span className="tabular text-xs text-muted-foreground">
                            {journalEntry.lines.length}
                          </span>
                        ),
                      },
                      {
                        header: "Amount",
                        align: "right",
                        cell: (journalEntry) => (
                          <span className="tabular">{fmt(journalEntry.debitTotal)}</span>
                        ),
                      },
                    ]}
                  />
                )}
              </SectionCard>
            </div>

            <SectionCard title="Recent postings by branch">
              {data.branches.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No branch activity yet.</p>
              ) : (
                <DataTable
                  rows={data.branches}
                  rowKey={(row) => row.branch}
                  columns={[
                    { header: "Branch", cell: (row) => row.branch },
                    {
                      header: "Entries",
                      align: "right",
                      cell: (row) => <span className="tabular">{row.postings}</span>,
                    },
                    {
                      header: "Value",
                      align: "right",
                      cell: (row) => <span className="tabular">{fmt(row.value)}</span>,
                    },
                  ]}
                />
              )}
            </SectionCard>
          </div>

          <SectionCard title="Account balances with movement">
            <DataTable
              rows={data.balances}
              rowKey={(row) => row.code}
              columns={[
                {
                  header: "Code",
                  cell: (row) => <span className="tabular text-xs font-medium">{row.code}</span>,
                },
                { header: "Account", cell: (row) => row.name },
                { header: "Type", cell: (row) => ACCOUNT_TYPE_LABELS[row.type] },
                {
                  header: "Balance",
                  align: "right",
                  cell: (row) => (
                    <span
                      className={row.balance.minor < 0n ? "tabular text-destructive" : "tabular"}
                    >
                      {fmt(row.balance)}
                    </span>
                  ),
                },
              ]}
            />
          </SectionCard>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Balances are derived from immutable journal entries; nothing is edited in place. Postings
        recorded manually are never shown as network-verified.
      </p>
    </AppShell>
  );
}
