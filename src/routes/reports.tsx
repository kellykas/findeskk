import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  PlannedNext,
  SectionCard,
  StatCard,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, money, type Money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import { ACCOUNT_TYPE_LABELS } from "@/domain/ledger";
import { buildPeriodReport, profitAndLossCsv, type ProfitAndLossRow } from "@/domain/reports";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import { reportQuery } from "@/services/reports.service";
import { fxQuery } from "@/services/forex.service";
import { momoQuery } from "@/services/momo.service";
import { momoCashMovement } from "@/domain/momo";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — FinDesk" },
      { name: "description", content: "Ledger-reconciled financial and operational reports." },
      { property: "og:title", content: "Reports — FinDesk" },
      {
        property: "og:description",
        content: "Ledger-reconciled financial and operational reports.",
      },
    ],
  }),
  component: Reports,
});

const today = () => new Date().toISOString().slice(0, 10);
const startOfMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

function Reports() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "reports.view"));
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const invalidRange = from > to;

  const ledger = useQuery({ ...reportQuery({ from, to }), enabled: allowed && !invalidRange });
  const forex = useQuery({ ...fxQuery(200), enabled: allowed });
  const momo = useQuery({ ...momoQuery(200), enabled: allowed });

  const report = useMemo(
    () => (ledger.data ? buildPeriodReport(ledger.data.accounts, ledger.data.lines) : null),
    [ledger.data],
  );

  const trades = (forex.data ?? []).filter(
    (trade) => trade.entryDate >= from && trade.entryDate <= to,
  );
  const momoRows = (momo.data ?? []).filter((row) => row.entryDate >= from && row.entryDate <= to);
  const tradeTurnover = trades.reduce((total, trade) => total + trade.ugxAmount.minor, 0n);
  const tradeMargin = trades.reduce((total, trade) => total + trade.margin.minor, 0n);
  const momoCommission = momoRows.reduce((total, row) => total + row.commission.minor, 0n);
  const momoVolume = momoRows.reduce(
    (total, row) => total + momoCashMovement(row.type, row.amount, row.commission).minor,
    0n,
  );

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title="Reports"
          description="Ledger-reconciled operational and financial reports."
        />
        <AccessDenied
          title="Reports are restricted"
          description="Reports are available to oversight, accounting and management roles. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  function exportCsv() {
    if (!report) return;
    const csv = profitAndLossCsv(report, { from, to });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `findesk-profit-and-loss-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageHeader
        title="Reports"
        description="Derived from posted journal lines, so every figure agrees with the ledger."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report}>
            Export P&L (CSV)
          </Button>
        }
      />

      <SectionCard title="Reporting period">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              max={to}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              min={from}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFrom(startOfMonth());
              setTo(today());
            }}
          >
            This month
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void ledger.refetch()}
            disabled={ledger.isFetching}
          >
            {ledger.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </SectionCard>

      {invalidRange && (
        <p className="mt-4 text-sm text-destructive">The start date must be before the end date.</p>
      )}

      {ledger.isPending && !invalidRange && (
        <p className="mt-4 text-sm text-muted-foreground">Loading the ledger…</p>
      )}

      {ledger.isError && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm">
          <p className="text-destructive">Could not read the ledger: {ledger.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void ledger.refetch()}
          >
            Try again
          </Button>
        </div>
      )}

      {report && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Income"
              value={formatMoney(report.incomeTotal)}
              hint="Credits in period"
            />
            <StatCard
              label="Expenses"
              value={formatMoney(report.expenseTotal)}
              hint="Debits in period"
            />
            <StatCard
              label="Net profit"
              value={formatMoney(report.netProfit)}
              hint={report.netProfit.minor < 0n ? "Loss in this period" : "Income less expenses"}
            />
            <StatCard
              label="Journal lines"
              value={String(report.postedLines)}
              hint={`${ledger.data?.entries ?? 0} entries`}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title="Income statement">
              <StatementTable
                rows={report.income}
                emptyLabel="No income has been posted in this period."
                totalLabel="Total income"
                total={report.incomeTotal}
              />
            </SectionCard>
            <SectionCard title="Expenses">
              <StatementTable
                rows={report.expenses}
                emptyLabel="No expenses have been posted in this period."
                totalLabel="Total expenses"
                total={report.expenseTotal}
              />
            </SectionCard>
          </div>

          <div className="mt-6">
            <SectionCard
              title="Trial balance"
              action={
                <Badge
                  variant="outline"
                  className={
                    report.trial.balanced
                      ? "font-normal"
                      : "border-destructive font-normal text-destructive"
                  }
                >
                  {report.trial.balanced ? "Balanced" : "Out of balance"}
                </Badge>
              }
            >
              <DataTable
                rows={report.trial.rows.filter(
                  (row) => row.debit.minor !== 0n || row.credit.minor !== 0n,
                )}
                rowKey={(row) => row.code}
                columns={[
                  {
                    header: "Code",
                    cell: (row) => <span className="tabular text-xs">{row.code}</span>,
                  },
                  { header: "Account", cell: (row) => row.name },
                  { header: "Type", cell: (row) => ACCOUNT_TYPE_LABELS[row.type] },
                  {
                    header: "Debits",
                    align: "right",
                    cell: (row) => (
                      <span className="tabular text-xs">
                        {row.debit.minor === 0n ? "—" : formatMoney(row.debit)}
                      </span>
                    ),
                  },
                  {
                    header: "Credits",
                    align: "right",
                    cell: (row) => (
                      <span className="tabular text-xs">
                        {row.credit.minor === 0n ? "—" : formatMoney(row.credit)}
                      </span>
                    ),
                  },
                ]}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
                <span>
                  Debits {formatMoney(report.trial.debitTotal)} · Credits{" "}
                  {formatMoney(report.trial.creditTotal)}
                </span>
                <span>
                  {from} to {to}
                </span>
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title="Forex operations">
              <div className="divide-y text-sm">
                <SummaryLine label="Trades" value={String(trades.length)} />
                <SummaryLine
                  label="UGX turnover"
                  value={formatMoney(money(tradeTurnover, BASE_CURRENCY))}
                />
                <SummaryLine
                  label="Margin earned"
                  value={formatMoney(money(tradeMargin, BASE_CURRENCY))}
                />
              </div>
            </SectionCard>
            <SectionCard title="Mobile money operations">
              <div className="divide-y text-sm">
                <SummaryLine label="Transactions" value={String(momoRows.length)} />
                <SummaryLine
                  label="Cash moved"
                  value={formatMoney(money(momoVolume, BASE_CURRENCY))}
                />
                <SummaryLine
                  label="Commission earned"
                  value={formatMoney(money(momoCommission, BASE_CURRENCY))}
                />
              </div>
            </SectionCard>
          </div>

          <PlannedNext
            features={[
              "Branch and teller performance breakdown",
              "Cash reconciliation report",
              "PDF export",
            ]}
          />
        </>
      )}
    </AppShell>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}

function StatementTable({
  rows,
  emptyLabel,
  totalLabel,
  total,
}: {
  rows: ProfitAndLossRow[];
  emptyLabel: string;
  totalLabel: string;
  total: Money;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div>
      <div className="divide-y">
        {rows.map((row) => (
          <div key={row.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span>
              <span className="tabular mr-2 text-xs text-muted-foreground">{row.code}</span>
              {row.name}
            </span>
            <span className="tabular font-medium">{formatMoney(row.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t bg-muted/40 px-4 py-3 text-sm font-semibold">
        <span>{totalLabel}</span>
        <span className="tabular">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
