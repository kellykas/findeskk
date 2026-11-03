import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { BASE_CURRENCY } from "@/domain/currency";
import { formatDelta, monthOverMonth } from "@/domain/dashboard";
import { ACCOUNT_TYPE_LABELS } from "@/domain/ledger";
import { formatMoney, money, type Money } from "@/domain/money";
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

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Chart geometry needs numbers; every figure shown as text stays exact. */
function chartValue(value: number | string | (number | string)[]): string {
  const single = Array.isArray(value) ? value[0] : value;
  return fmt(money(BigInt(Math.round(Number(single ?? 0))), BASE_CURRENCY));
}

function compactAxis(value: number): string {
  const amount = Number(value);
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000)}K`;
  return String(amount);
}

function Dashboard() {
  const { status } = useSession();

  // AppShell renders the loading state or the sign-in gate; querying the ledger
  // only makes sense once a real session exists.
  if (status !== "signed_in") return <AppShell>{null}</AppShell>;

  return <DashboardContent />;
}

function DashboardContent() {
  const { viewer } = useSession();
  const { data, isPending, isError, error, isFetching, refetch } = useQuery(dashboardQuery);

  const monthName = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstName = viewer?.displayName?.trim().split(/\s+/)[0] ?? "there";

  if (isPending) {
    return (
      <AppShell>
        <PageHeader title={`Welcome back, ${firstName}!`} description="Loading the ledger…" />
        <p className="text-sm text-muted-foreground">Loading ledger balances…</p>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell>
        <PageHeader title={`Welcome back, ${firstName}!`} description="Company-wide position." />
        <SectionCard title="Balances unavailable">
          <div className="space-y-3 px-5 py-6 text-sm">
            <p className="text-destructive">
              Could not read ledger balances:{" "}
              {error instanceof Error ? error.message : "unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        </SectionCard>
      </AppShell>
    );
  }

  const totalFor = (type: "asset" | "income" | "expense"): Money =>
    data.totals.find((total) => total.type === type)?.amount ?? money(0n, BASE_CURRENCY);

  const flow = data.flow;
  const current = flow.at(-1);
  const previous = flow.at(-2);
  const incomeDelta = current && previous ? monthOverMonth(current.income, previous.income) : null;
  const expenseDelta =
    current && previous ? monthOverMonth(current.expense, previous.expense) : null;

  const income = current?.income ?? money(0n, BASE_CURRENCY);
  const expense = current?.expense ?? money(0n, BASE_CURRENCY);
  const net = money(income.minor - expense.minor, BASE_CURRENCY);

  const chartData = flow.map((point) => ({
    label: point.label,
    income: Number(point.income.minor),
    expense: Number(point.expense.minor),
  }));

  const expenseAccounts = data.balances.filter(
    (row) => row.type === "expense" && row.balance.minor > 0n,
  );
  const mix = expenseAccounts.map((row) => ({
    name: row.name,
    value: Number(row.balance.minor),
  }));
  const mixTotal = expenseAccounts.reduce((total, row) => total + row.balance.minor, 0n);

  const cashTotal = data.cash.reduce((total, line) => total + line.amount.minor, 0n);

  return (
    <AppShell>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            It is the best time to manage your finances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {monthName}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total assets"
          value={fmt(totalFor("asset"))}
          hint="Everything the company owns, all branches"
        />
        <StatCard
          label="Income"
          value={fmt(income)}
          delta={formatDelta(incomeDelta)}
          tone={(incomeDelta ?? 0) >= 0 ? "positive" : "negative"}
          hint="vs last month"
        />
        <StatCard
          label="Expense"
          value={fmt(expense)}
          delta={formatDelta(expenseDelta)}
          tone={(expenseDelta ?? 0) > 0 ? "negative" : "positive"}
          hint="vs last month"
        />
        <StatCard
          label="Net profit"
          value={fmt(net)}
          hint={net.minor < 0n ? "Loss this month" : "Income less expenses"}
          tone={net.minor < 0n ? "negative" : "positive"}
        />
      </div>

      {!data.hasData && (
        <div className="mt-6">
          <SectionCard title="No transactions posted yet">
            <div className="space-y-2 px-5 pb-6 text-sm text-muted-foreground">
              <p>
                The ledger is empty, so every figure here is zero. Nothing on this page is simulated
                or estimated.
              </p>
              <p>
                Figures appear as soon as you record your first transaction: an expense or income, a
                forex trade, or a mobile money entry.
              </p>
            </div>
          </SectionCard>
        </div>
      )}

      {data.hasData && (
        <>
          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SectionCard
                title="Money flow"
                action={
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-chart-1" />
                      Income
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-chart-2" />
                      Expense
                    </span>
                  </div>
                }
              >
                <div className="h-[248px] px-3 pb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      barGap={6}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="var(--border)"
                        strokeDasharray="3 6"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={compactAxis}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      />
                      <Tooltip
                        formatter={chartValue}
                        cursor={{ fill: "var(--muted)" }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          fontSize: 12,
                        }}
                      />
                      <Bar
                        dataKey="income"
                        name="Income"
                        fill="var(--chart-1)"
                        radius={[6, 6, 6, 6]}
                        maxBarSize={18}
                      />
                      <Bar
                        dataKey="expense"
                        name="Expense"
                        fill="var(--chart-2)"
                        radius={[6, 6, 6, 6]}
                        maxBarSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Expense mix">
              {expenseAccounts.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-muted-foreground">No expenses recorded yet.</p>
              ) : (
                <>
                  <div className="relative h-[196px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mix}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={82}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {mix.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={chartValue}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] text-muted-foreground">Total expense</span>
                      <span className="tabular text-base font-semibold">
                        {fmt(money(mixTotal, BASE_CURRENCY))}
                      </span>
                    </div>
                  </div>
                  <ul className="space-y-1.5 px-5 pb-5">
                    {expenseAccounts.slice(0, 5).map((row, index) => (
                      <li key={row.code} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {row.name}
                        </span>
                        <span className="tabular font-medium">{fmt(row.balance)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </SectionCard>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SectionCard title="Recent transactions">
                {data.recent.length === 0 ? (
                  <p className="px-5 pb-6 text-sm text-muted-foreground">
                    No journal entries have been posted yet.
                  </p>
                ) : (
                  <DataTable
                    rows={data.recent}
                    rowKey={(entry) => entry.id}
                    columns={[
                      {
                        header: "Date",
                        cell: (entry) => (
                          <span className="tabular text-xs">
                            {new Date(entry.entryDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        ),
                      },
                      {
                        header: "Description",
                        cell: (entry) => (
                          <div className="leading-tight">
                            <div className="font-medium">{entry.description}</div>
                            <div className="text-xs text-muted-foreground">{entry.reference}</div>
                          </div>
                        ),
                      },
                      {
                        header: "Amount",
                        align: "right",
                        cell: (entry) => (
                          <span className="tabular font-medium">{fmt(entry.debitTotal)}</span>
                        ),
                      },
                    ]}
                  />
                )}
              </SectionCard>
            </div>

            <SectionCard title="Cash & float">
              {data.cash.length === 0 ? (
                <p className="px-5 pb-6 text-sm text-muted-foreground">No cash accounts found.</p>
              ) : (
                <div className="space-y-4 px-5 pb-5 pt-1">
                  {data.cash.map((line) => {
                    const percent = cashTotal === 0n ? 0n : (line.amount.minor * 100n) / cashTotal;
                    return (
                      <div key={line.code}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{line.label}</span>
                          <span className="tabular shrink-0 text-muted-foreground">
                            {fmt(line.amount)}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(2, Math.min(100, Number(percent)))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="mt-4">
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
                      <span className={row.balance.minor < 0n ? "text-destructive" : "font-medium"}>
                        {fmt(row.balance)}
                      </span>
                    ),
                  },
                ]}
              />
            </SectionCard>
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Balances are derived from immutable journal entries; nothing is edited in place. Postings
        recorded manually are never shown as network-verified.
      </p>
    </AppShell>
  );
}
