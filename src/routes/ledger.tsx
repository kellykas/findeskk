import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/access";
import { ACCOUNT_TYPE_LABELS } from "@/domain/ledger";
import { formatMoney, type Money } from "@/domain/money";
import { useSession } from "@/hooks/use-session";
import {
  accountBalancesQuery,
  recentEntriesQuery,
  toTrialBalance,
} from "@/services/ledger.service";

export const Route = createFileRoute("/ledger")({
  head: () => ({
    meta: [
      { title: "Ledger — FinDesk" },
      {
        name: "description",
        content: "Chart of accounts, trial balance and posted journal entries.",
      },
      { property: "og:title", content: "Ledger — FinDesk" },
      {
        property: "og:description",
        content: "Chart of accounts, trial balance and posted journal entries.",
      },
    ],
  }),
  component: Ledger,
});

const fmt = (amount: Money) => formatMoney(amount);

interface JournalRow {
  key: string;
  date: string;
  reference: string;
  description: string;
  account: string;
  debit: Money | null;
  credit: Money | null;
}

function Ledger() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "reports.view"));
  const balances = useQuery({ ...accountBalancesQuery, enabled: allowed });
  const entries = useQuery({ ...recentEntriesQuery(25), enabled: allowed });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title="Ledger"
          description="Chart of accounts, trial balance and posted journal entries."
        />
        <AccessDenied
          title="The ledger is restricted"
          description="Accounting and oversight roles can read the ledger. Ask a super admin or the company owner for access."
        />
      </AppShell>
    );
  }

  const loading = balances.isPending || entries.isPending;
  const failure = balances.error ?? entries.error;
  const accounts = balances.data ?? [];
  const trial = toTrialBalance(accounts);
  const accountLabels = new Map(
    accounts.map((account) => [account.accountId, `${account.code} · ${account.name}`]),
  );

  const journalRows: JournalRow[] = (entries.data ?? []).flatMap((entry) =>
    entry.lines.map((line) => ({
      key: `${entry.id}-${line.id}`,
      date: entry.entryDate,
      reference: entry.reference,
      description: entry.description,
      account: accountLabels.get(line.accountId) ?? "Unknown account",
      debit: line.side === "debit" ? line.amount : null,
      credit: line.side === "credit" ? line.amount : null,
    })),
  );

  return (
    <AppShell>
      <PageHeader
        title="Ledger"
        description="Read-only view of the chart of accounts, trial balance and posted entries."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void balances.refetch();
              void entries.refetch();
            }}
            disabled={balances.isFetching || entries.isFetching}
          >
            {balances.isFetching || entries.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {loading && <p className="text-sm text-muted-foreground">Loading the ledger…</p>}

      {!loading && failure && (
        <SectionCard title="Ledger unavailable">
          <div className="space-y-3 px-4 py-6 text-sm">
            <p className="text-destructive">
              Could not read the ledger:{" "}
              {failure instanceof Error ? failure.message : "unknown error"}
            </p>
            <p className="text-muted-foreground">
              If this is a new deployment, check that the ledger migration has been applied.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void balances.refetch();
                void entries.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </SectionCard>
      )}

      {!loading && !failure && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Accounts" value={String(trial.rows.length)} />
            <StatCard label="Total debits" value={fmt(trial.debitTotal)} />
            <StatCard label="Total credits" value={fmt(trial.creditTotal)} />
            <StatCard
              label="Entries shown"
              value={String(entries.data?.length ?? 0)}
              hint="Latest 25"
            />
          </div>

          <SectionCard
            title="Trial balance"
            action={
              <Badge
                variant="outline"
                className={
                  trial.balanced ? "font-normal" : "border-destructive font-normal text-destructive"
                }
              >
                {trial.balanced ? "Balanced" : "Out of balance"}
              </Badge>
            }
          >
            {trial.rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                The chart of accounts is empty. Apply the ledger migration to seed the accounts.
              </p>
            ) : (
              <DataTable
                rows={trial.rows}
                rowKey={(row) => row.code}
                columns={[
                  {
                    header: "Code",
                    cell: (row) => <span className="tabular text-xs font-medium">{row.code}</span>,
                  },
                  { header: "Account", cell: (row) => row.name },
                  { header: "Type", cell: (row) => ACCOUNT_TYPE_LABELS[row.type] },
                  {
                    header: "Debits",
                    align: "right",
                    cell: (row) => (
                      <span className="tabular text-xs">
                        {row.debit.minor === 0n ? "—" : fmt(row.debit)}
                      </span>
                    ),
                  },
                  {
                    header: "Credits",
                    align: "right",
                    cell: (row) => (
                      <span className="tabular text-xs">
                        {row.credit.minor === 0n ? "—" : fmt(row.credit)}
                      </span>
                    ),
                  },
                  {
                    header: "Balance",
                    align: "right",
                    cell: (row) => (
                      <span
                        className={
                          row.balance.minor < 0n
                            ? "tabular font-medium text-destructive"
                            : "tabular font-medium"
                        }
                      >
                        {fmt(row.balance)}
                      </span>
                    ),
                  },
                ]}
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
              <span>
                Debits {fmt(trial.debitTotal)} · Credits {fmt(trial.creditTotal)}
              </span>
              <span>
                {trial.balanced
                  ? "Every posted entry balances, so the ledger totals agree."
                  : "The ledger does not balance — investigate before posting further entries."}
              </span>
            </div>
          </SectionCard>

          <div className="mt-6">
            <SectionCard title="Recent journal lines">
              {journalRows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No journal entries have been posted yet. Lines appear here as soon as an opening
                  balance or a transaction is posted.
                </p>
              ) : (
                <DataTable
                  rows={journalRows}
                  rowKey={(row) => row.key}
                  columns={[
                    {
                      header: "Date",
                      cell: (row) => (
                        <span className="tabular text-xs">
                          {new Date(row.date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      ),
                    },
                    {
                      header: "Reference",
                      cell: (row) => <span className="tabular text-xs">{row.reference}</span>,
                    },
                    { header: "Description", cell: (row) => row.description },
                    { header: "Account", cell: (row) => row.account },
                    {
                      header: "Debit",
                      align: "right",
                      cell: (row) => (
                        <span className="tabular">{row.debit ? fmt(row.debit) : "—"}</span>
                      ),
                    },
                    {
                      header: "Credit",
                      align: "right",
                      cell: (row) => (
                        <span className="tabular">{row.credit ? fmt(row.credit) : "—"}</span>
                      ),
                    },
                  ]}
                />
              )}
            </SectionCard>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Posted entries are immutable. Corrections are made with reversing entries, never by
            editing history.
          </p>
        </>
      )}
    </AppShell>
  );
}
