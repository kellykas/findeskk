import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { can } from "@/domain/access";
import { BASE_CURRENCY } from "@/domain/currency";
import { todayUtcDate } from "@/domain/date";
import { t } from "@/domain/i18n";
import { ACCOUNT_TYPE_LABELS, signedBalance } from "@/domain/ledger";
import { formatMoney, money, type Money } from "@/domain/money";
import {
  buildBranchPerformance,
  buildPeriodReport,
  buildTellerPerformance,
  changeVsPrevious,
  performanceCsv,
  previousPeriod,
  profitAndLossCsv,
  trialBalanceCsv,
  type BranchPerformance,
  type ProfitAndLossRow,
  type TellerPerformance,
} from "@/domain/reports";
import { useSession } from "@/hooks/use-session";
import { expensesRangeQuery } from "@/services/expenses.service";
import { fxRangeQuery } from "@/services/forex.service";
import { incomesRangeQuery } from "@/services/income.service";
import { momoRangeQuery } from "@/services/momo.service";
import { reportQuery } from "@/services/reports.service";
import { settingsQuery } from "@/services/settings.service";
import { branchesQuery, staffQuery } from "@/services/staff.service";

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

const DAY_MS = 86_400_000;

const isoDay = (value: number) => new Date(value).toISOString().slice(0, 10);

/**
 * Shortcuts a shop actually asks for: today's till, the week, this month, the
 * month being closed and the year to date. Custom dates stay available.
 */
function rangePresets() {
  const today = todayUtcDate();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const monthStart = Date.UTC(year, month, 1);
  return [
    { id: "today", label: "Today", from: today, to: today },
    { id: "week", label: "Last 7 days", from: isoDay(Date.now() - 6 * DAY_MS), to: today },
    { id: "month", label: "This month", from: isoDay(monthStart), to: today },
    {
      id: "last-month",
      label: "Last month",
      from: isoDay(Date.UTC(year, month - 1, 1)),
      to: isoDay(monthStart - DAY_MS),
    },
    { id: "year", label: "This year", from: `${year}-01-01`, to: today },
  ];
}

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "reports.view"));
  const presets = useMemo(rangePresets, []);
  const [range, setRange] = useState(() => {
    const month = presets.find((preset) => preset.id === "month");
    return { from: month?.from ?? todayUtcDate(), to: month?.to ?? todayUtcDate() };
  });
  const invalidRange = range.from > range.to;

  const ledger = useQuery({ ...reportQuery(range), enabled: allowed && !invalidRange });
  const priorRange = useMemo(() => previousPeriod(range), [range]);
  const prior = useQuery({
    ...reportQuery(priorRange ?? range),
    enabled: allowed && !invalidRange && priorRange !== null,
  });

  const forex = useQuery({ ...fxRangeQuery(range), enabled: allowed && !invalidRange });
  const momo = useQuery({ ...momoRangeQuery(range), enabled: allowed && !invalidRange });
  const expenses = useQuery({ ...expensesRangeQuery(range), enabled: allowed && !invalidRange });
  const incomes = useQuery({ ...incomesRangeQuery(range), enabled: allowed && !invalidRange });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const staff = useQuery({ ...staffQuery, enabled: allowed });
  const company = useQuery({ ...settingsQuery, enabled: allowed });

  const report = useMemo(
    () => (ledger.data ? buildPeriodReport(ledger.data.accounts, ledger.data.lines) : null),
    [ledger.data],
  );
  const priorReport = useMemo(
    () => (prior.data ? buildPeriodReport(prior.data.accounts, prior.data.lines) : null),
    [prior.data],
  );

  const trades = useMemo(() => forex.data ?? [], [forex.data]);
  const momoRows = useMemo(() => momo.data ?? [], [momo.data]);
  const expenseRows = useMemo(() => expenses.data ?? [], [expenses.data]);
  const incomeRows = useMemo(() => incomes.data ?? [], [incomes.data]);

  const performance = useMemo(() => {
    const sources = {
      branches: (branches.data ?? []).map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
      })),
      staff: (staff.data ?? []).map((member) => ({
        id: member.id,
        displayName: member.displayName,
      })),
      trades,
      momo: momoRows,
      expenses: expenseRows,
      income: incomeRows,
    };
    return {
      branches: buildBranchPerformance(sources),
      tellers: buildTellerPerformance(sources),
    };
  }, [branches.data, staff.data, trades, momoRows, expenseRows, incomeRows]);

  const totals = useMemo(
    () => ({
      tradeTurnover: trades.reduce((total, trade) => total + trade.ugxAmount.minor, 0n),
      tradeMargin: trades.reduce((total, trade) => total + trade.margin.minor, 0n),
      momoCommission: momoRows.reduce((total, row) => total + row.commission.minor, 0n),
    }),
    [trades, momoRows],
  );
  const momoVolume = useMemo(
    () => performance.branches.reduce((total, row) => total + row.momoVolume.minor, 0n),
    [performance.branches],
  );

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title={t("Reports")}
          description={t("Ledger-reconciled operational and financial reports.")}
        />
        <AccessDenied
          title="Reports are restricted"
          description="Reports are available to oversight, accounting and management roles. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  const incomeChange =
    report && priorReport ? changeVsPrevious(report.incomeTotal, priorReport.incomeTotal) : null;
  const expenseChange =
    report && priorReport ? changeVsPrevious(report.expenseTotal, priorReport.expenseTotal) : null;
  const profitChange =
    report && priorReport ? changeVsPrevious(report.netProfit, priorReport.netProfit) : null;
  const comparedHint = priorReport ? t("vs previous period") : undefined;

  const noActivity =
    (report?.postedLines ?? 0) === 0 &&
    trades.length === 0 &&
    momoRows.length === 0 &&
    expenseRows.length === 0 &&
    incomeRows.length === 0;

  const periodLabel = `${range.from} to ${range.to}`;

  return (
    <AppShell>
      <PageHeader
        title={t("Reports")}
        description={t(
          "Financial figures come from posted journal lines; operations cover every record in the period.",
        )}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                report &&
                downloadCsv(
                  `findesk-profit-and-loss-${range.from}-to-${range.to}.csv`,
                  profitAndLossCsv(report, range),
                )
              }
              disabled={!report}
            >
              Export P&L (CSV)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => window.print()}
              title="Opens the print dialog, where you can save the report as a PDF"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print / Save PDF
            </Button>
          </>
        }
      />

      {/* Printed copy: the screen chrome is hidden, this heading is not. */}
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-semibold">{company.data?.companyName ?? "FinDesk"}</p>
        <p className="text-sm">
          {t("Financial report")} · {periodLabel}
        </p>
      </div>

      <div className="no-print">
        <SectionCard title={t("Reporting period")}>
          <div className="flex flex-wrap items-end gap-3 px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={range.from}
                onChange={(event) => setRange({ ...range, from: event.target.value })}
                max={range.to}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={range.to}
                onChange={(event) => setRange({ ...range, to: event.target.value })}
                min={range.from}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => {
                const active = preset.from === range.from && preset.to === range.to;
                return (
                  <Button
                    key={preset.id}
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={active}
                    onClick={() => setRange({ from: preset.from, to: preset.to })}
                  >
                    {t(preset.label)}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void ledger.refetch();
                void forex.refetch();
                void momo.refetch();
                void expenses.refetch();
                void incomes.refetch();
              }}
              disabled={ledger.isFetching}
            >
              {ledger.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </SectionCard>

        {invalidRange && (
          <p className="mt-4 text-sm text-destructive">
            The start date must be before the end date.
          </p>
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
      </div>

      {report && (
        <>
          {noActivity && (
            <p className="mt-4 rounded-md border border-border/70 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              No postings or operations in this period. Pick another range or record a transaction.
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Income"
              value={formatMoney(report.incomeTotal)}
              hint={comparedHint ?? "Credits in period"}
              delta={incomeChange?.delta}
              tone={incomeChange?.direction === "down" ? "negative" : "positive"}
            />
            <StatCard
              label="Expenses"
              value={formatMoney(report.expenseTotal)}
              hint={comparedHint ?? "Debits in period"}
              delta={expenseChange?.delta}
              tone={expenseChange?.direction === "up" ? "negative" : "positive"}
            />
            <StatCard
              label="Net profit"
              value={formatMoney(report.netProfit)}
              hint={
                comparedHint ??
                (report.netProfit.minor < 0n ? "Loss in this period" : "Income less expenses")
              }
              delta={profitChange?.delta}
              tone={profitChange?.direction === "down" ? "negative" : "positive"}
            />
            <StatCard
              label="Journal lines"
              value={String(report.postedLines)}
              hint={`${ledger.data?.entries ?? 0} entries`}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("Income statement")}>
              <StatementTable
                rows={report.income}
                emptyLabel="No income has been posted in this period."
                totalLabel="Total income"
                total={report.incomeTotal}
              />
            </SectionCard>
            <SectionCard title={t("Expenses")}>
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        `findesk-trial-balance-${range.from}-to-${range.to}.csv`,
                        trialBalanceCsv(report, range),
                      )
                    }
                  >
                    {t("Export trial balance (CSV)")}
                  </Button>
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
                </div>
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
                <span>{periodLabel}</span>
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("Forex operations")}>
              <div className="divide-y text-sm">
                <SummaryLine label="Trades" value={String(trades.length)} />
                <SummaryLine
                  label="UGX turnover"
                  value={formatMoney(money(totals.tradeTurnover, BASE_CURRENCY))}
                />
                <SummaryLine
                  label="Margin earned"
                  value={formatMoney(money(totals.tradeMargin, BASE_CURRENCY))}
                />
              </div>
            </SectionCard>
            <SectionCard title={t("Mobile money operations")}>
              <div className="divide-y text-sm">
                <SummaryLine label="Transactions" value={String(momoRows.length)} />
                <SummaryLine
                  label="Cash moved"
                  value={formatMoney(money(momoVolume, BASE_CURRENCY))}
                />
                <SummaryLine
                  label="Commission earned"
                  value={formatMoney(money(totals.momoCommission, BASE_CURRENCY))}
                />
              </div>
            </SectionCard>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard
              title={t("Branch performance breakdown")}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      `findesk-branch-and-teller-${range.from}-to-${range.to}.csv`,
                      performanceCsv(performance.branches, performance.tellers, range),
                    )
                  }
                  disabled={performance.branches.length === 0 && performance.tellers.length === 0}
                >
                  {t("Export activity (CSV)")}
                </Button>
              }
            >
              <BranchTable rows={performance.branches} />
            </SectionCard>
            <SectionCard title={t("Teller performance breakdown")}>
              <TellerTable rows={performance.tellers} />
            </SectionCard>
          </div>

          <div className="mt-6">
            <SectionCard title={t("Cash reconciliation report")}>
              {(() => {
                const cashRows = (report?.trial.rows ?? []).filter((row) => row.code === "1000");
                if (cashRows.length === 0) {
                  return (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No cash account (1000) found in this period.
                    </p>
                  );
                }
                return (
                  <div className="divide-y text-sm">
                    {cashRows.map((row) => {
                      const balance = signedBalance({
                        normalBalance: row.normalBalance,
                        debit: row.debit,
                        credit: row.credit,
                      });
                      return (
                        <div key={row.code} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <div className="font-medium">
                              {row.code} · {row.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ACCOUNT_TYPE_LABELS[row.type]}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="tabular font-medium">
                              Balance: {formatMoney(balance)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Debits {formatMoney(row.debit)} · Credits {formatMoney(row.credit)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </SectionCard>
          </div>
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

function BranchTable({ rows }: { rows: BranchPerformance[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">No branch activity in this period.</p>
    );
  }
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.branchId}
      columns={[
        { header: "Branch", cell: (row) => <span className="font-medium">{row.label}</span> },
        {
          header: "Forex",
          align: "right",
          cell: (row) =>
            row.forexCount === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <span className="tabular text-xs">
                {row.forexCount} · {formatMoney(row.forexTurnover)}
              </span>
            ),
        },
        {
          header: "Mobile money",
          align: "right",
          cell: (row) =>
            row.momoCount === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <span className="tabular text-xs">
                {row.momoCount} · {formatMoney(row.momoVolume)}
              </span>
            ),
        },
        {
          header: "Income",
          align: "right",
          cell: (row) => <span className="tabular text-xs">{formatMoney(row.incomeTotal)}</span>,
        },
        {
          header: "Expenses",
          align: "right",
          cell: (row) => <span className="tabular text-xs">{formatMoney(row.expenseTotal)}</span>,
        },
      ]}
    />
  );
}

function TellerTable({ rows }: { rows: TellerPerformance[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">No teller activity in this period.</p>
    );
  }
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.userId}
      columns={[
        { header: "Teller", cell: (row) => <span className="font-medium">{row.name}</span> },
        { header: "Transactions", align: "right", cell: (row) => String(row.count) },
        {
          header: "Value",
          align: "right",
          cell: (row) => <span className="tabular font-medium">{formatMoney(row.value)}</span>,
        },
      ]}
    />
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
