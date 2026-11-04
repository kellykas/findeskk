import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, money, type Money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import { ACCOUNT_TYPE_LABELS, signedBalance } from "@/domain/ledger";
import { buildPeriodReport, profitAndLossCsv, type ProfitAndLossRow } from "@/domain/reports";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import { reportQuery } from "@/services/reports.service";
import { fxQuery } from "@/services/forex.service";
import { momoQuery } from "@/services/momo.service";
import { momoCashMovement } from "@/domain/momo";
import { expensesQuery } from "@/services/expenses.service";
import { incomesQuery } from "@/services/income.service";
import { branchesQuery, staffQuery } from "@/services/staff.service";
import { Printer } from "lucide-react";

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
  const expenses = useQuery({ ...expensesQuery, enabled: allowed });
  const incomes = useQuery({ ...incomesQuery, enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const staff = useQuery({ ...staffQuery, enabled: allowed });

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

  // No PDF library: the browser's own print dialog can save the page as PDF.
  const printReport = () => {
    window.print();
  };

  return (
    <AppShell>
      <PageHeader
        title={t("Reports")}
        description={t(
          "Financial figures come from posted journal lines. Forex and mobile money totals cover the latest 200 records in the period.",
        )}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!report}>
              Export P&L (CSV)
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={printReport}
              title="Opens the print dialog, where you can save the report as a PDF"
            >
              <Printer className="mr-2 h-4 w-4" />
              Print / Save PDF
            </Button>
          </>
        }
      />

      <SectionCard title={t("Reporting period")}>
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
            <SectionCard title={t("Forex operations")}>
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
            <SectionCard title={t("Mobile money operations")}>
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("Branch performance breakdown")}>
              {(() => {
                const branchMap = new Map<
                  string,
                  {
                    name: string;
                    forex: bigint;
                    forexCount: number;
                    momo: bigint;
                    momoCount: number;
                    expenses: bigint;
                    expenseCount: number;
                    income: bigint;
                    incomeCount: number;
                  }
                >();
                for (const b of branches.data ?? []) {
                  branchMap.set(b.id, {
                    name: `${b.code} · ${b.name}`,
                    forex: 0n,
                    forexCount: 0,
                    momo: 0n,
                    momoCount: 0,
                    expenses: 0n,
                    expenseCount: 0,
                    income: 0n,
                    incomeCount: 0,
                  });
                }
                for (const t of trades) {
                  const key = t.branchId;
                  const entry = branchMap.get(key) ?? {
                    name: key,
                    forex: 0n,
                    forexCount: 0,
                    momo: 0n,
                    momoCount: 0,
                    expenses: 0n,
                    expenseCount: 0,
                    income: 0n,
                    incomeCount: 0,
                  };
                  entry.forex += t.ugxAmount.minor;
                  entry.forexCount += 1;
                  branchMap.set(key, entry);
                }
                for (const m of momoRows) {
                  const key = m.branchId;
                  const entry = branchMap.get(key) ?? {
                    name: key,
                    forex: 0n,
                    forexCount: 0,
                    momo: 0n,
                    momoCount: 0,
                    expenses: 0n,
                    expenseCount: 0,
                    income: 0n,
                    incomeCount: 0,
                  };
                  entry.momo += momoCashMovement(m.type, m.amount, m.commission).minor;
                  entry.momoCount += 1;
                  branchMap.set(key, entry);
                }
                const expRows = (expenses.data ?? []).filter(
                  (row) => row.expenseDate >= from && row.expenseDate <= to,
                );
                for (const e of expRows) {
                  const key = e.branchId;
                  const entry = branchMap.get(key) ?? {
                    name: key,
                    forex: 0n,
                    forexCount: 0,
                    momo: 0n,
                    momoCount: 0,
                    expenses: 0n,
                    expenseCount: 0,
                    income: 0n,
                    incomeCount: 0,
                  };
                  entry.expenses += e.amount.minor;
                  entry.expenseCount += 1;
                  branchMap.set(key, entry);
                }
                const incRows = (incomes.data ?? []).filter(
                  (row) => row.incomeDate >= from && row.incomeDate <= to,
                );
                for (const i of incRows) {
                  const key = i.branchId;
                  const entry = branchMap.get(key) ?? {
                    name: key,
                    forex: 0n,
                    forexCount: 0,
                    momo: 0n,
                    momoCount: 0,
                    expenses: 0n,
                    expenseCount: 0,
                    income: 0n,
                    incomeCount: 0,
                  };
                  entry.income += i.amount.minor;
                  entry.incomeCount += 1;
                  branchMap.set(key, entry);
                }
                const items = [...branchMap.values()].filter(
                  (v) => v.forexCount + v.momoCount + v.expenseCount + v.incomeCount > 0,
                );
                if (items.length === 0)
                  return (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No activity in period</p>
                  );
                return (
                  <div className="divide-y text-sm">
                    {items.map((item) => (
                      <div key={item.name} className="px-4 py-3 space-y-1">
                        <div className="font-medium">{item.name}</div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>
                            Forex: {item.forexCount} (
                            {formatMoney(money(item.forex, BASE_CURRENCY))})
                          </span>
                          <span>
                            MoMo: {item.momoCount} ({formatMoney(money(item.momo, BASE_CURRENCY))})
                          </span>
                          <span>
                            Income: {item.incomeCount} (
                            {formatMoney(money(item.income, BASE_CURRENCY))})
                          </span>
                          <span>
                            Expenses: {item.expenseCount} (
                            {formatMoney(money(item.expenses, BASE_CURRENCY))})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </SectionCard>
            <SectionCard title={t("Teller performance breakdown")}>
              {(() => {
                const tellerMap = new Map<string, { name: string; count: number; value: bigint }>();
                const nameFor = (id: string | null | undefined) => {
                  if (!id) return "System";
                  const s = (staff.data ?? []).find((x) => x.id === id);
                  return s?.displayName || id.slice(0, 8);
                };
                for (const t of trades) {
                  if (!t.createdBy) continue;
                  const key = t.createdBy;
                  const e = tellerMap.get(key) ?? { name: nameFor(key), count: 0, value: 0n };
                  e.count += 1;
                  e.value += t.ugxAmount.minor;
                  tellerMap.set(key, e);
                }
                const expRows = (expenses.data ?? []).filter(
                  (row) => row.expenseDate >= from && row.expenseDate <= to,
                );
                for (const ex of expRows) {
                  if (!ex.createdBy) continue;
                  const key = ex.createdBy;
                  const e = tellerMap.get(key) ?? { name: nameFor(key), count: 0, value: 0n };
                  e.count += 1;
                  e.value += ex.amount.minor;
                  tellerMap.set(key, e);
                }
                const incRows = (incomes.data ?? []).filter(
                  (row) => row.incomeDate >= from && row.incomeDate <= to,
                );
                for (const inc of incRows) {
                  if (!inc.createdBy) continue;
                  const key = inc.createdBy;
                  const e = tellerMap.get(key) ?? { name: nameFor(key), count: 0, value: 0n };
                  e.count += 1;
                  e.value += inc.amount.minor;
                  tellerMap.set(key, e);
                }
                for (const m of momoRows) {
                  if (!m.createdBy) continue;
                  const key = m.createdBy;
                  const e = tellerMap.get(key) ?? { name: nameFor(key), count: 0, value: 0n };
                  e.count += 1;
                  e.value += momoCashMovement(m.type, m.amount, m.commission).minor;
                  tellerMap.set(key, e);
                }
                const items = [...tellerMap.values()].sort((a, b) => (b.value > a.value ? 1 : -1));
                if (items.length === 0)
                  return (
                    <p className="px-4 py-6 text-sm text-muted-foreground">No activity in period</p>
                  );
                return (
                  <div className="divide-y text-sm">
                    {items.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between px-4 py-2.5"
                      >
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.count} transactions
                          </div>
                        </div>
                        <div className="tabular font-medium">
                          {formatMoney(money(item.value, BASE_CURRENCY))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
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
