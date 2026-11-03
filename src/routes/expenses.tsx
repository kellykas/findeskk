import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ExpenseDialog, type ExpenseFormValues } from "@/components/expenses/ExpenseDialog";
import { IncomeDialog, type IncomeFormValues } from "@/components/expenses/IncomeDialog";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  PlannedNext,
  SectionCard,
  StatCard,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import {
  buildExpenseSummary,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_SOURCE_LABELS,
  type ExpenseCategory,
  type ExpenseRecord,
} from "@/domain/expenses";
import { INCOME_CATEGORY_LABELS, INCOME_RECEIPT_SOURCE_LABELS, type IncomeRecord } from "@/domain/income";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import { expensesQuery, recordExpense } from "@/services/expenses.service";
import { incomesQuery, recordIncome } from "@/services/income.service";
import { branchesQuery } from "@/services/staff.service";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Finance — FinDesk" },
      { name: "description", content: "Record expenses and read the expense ledger." },
      { property: "og:title", content: "Expenses & Finance — FinDesk" },
      { property: "og:description", content: "Record expenses and read the expense ledger." },
    ],
  }),
  component: Expenses,
});

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const monthKey = (value: string) => value.slice(0, 7);

function Expenses() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "expenses.manage"));
  const expenses = useQuery({ ...expensesQuery, enabled: allowed });
  const incomes = useQuery({ ...incomesQuery, enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const queryClient = useQueryClient();

  const [recordForm, setRecordForm] = useState(false);
  const [recordIncomeForm, setRecordIncomeForm] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory | "all">("all");

  const save = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      recordExpense({ ...values, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      toast.success("Expense recorded and posted to the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setRecordForm(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveIncome = useMutation({
    mutationFn: (values: IncomeFormValues) =>
      recordIncome({ ...values, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      toast.success("Income recorded and posted to the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["income"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setRecordIncomeForm(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const branchNames = new Map(branchOptions.map((b) => [b.id, `${b.code} · ${b.name}`]));

  const rows = expenses.data ?? [];
  const visibleRows = useMemo(
    () => (category === "all" ? rows : rows.filter((row) => row.category === category)),
    [rows, category],
  );

  const summary = useMemo(() => buildExpenseSummary(visibleRows), [visibleRows]);
  const thisMonth = useMemo(() => {
    const key = new Date().toISOString().slice(0, 7);
    return rows.filter((row) => monthKey(row.expenseDate) === key);
  }, [rows]);
  const monthTotal = thisMonth.reduce((total, row) => total + row.amount.minor, 0n);

  const categoriesPresent = useMemo(() => [...new Set(rows.map((row) => row.category))], [rows]);

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title="Expenses & Finance"
          description="Record expenses and income and read the ledgers."
        />
        <AccessDenied
          title="Expenses and income are restricted"
          description="Recording is available to the company owner, super admins, general managers and accountants. Ask a super admin to review your roles."
        />
      </AppShell>
    );
  }

  const incomeRows = incomes.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Expenses & Finance"
        description="Every expense and income posts a balanced journal entry against the chart of accounts."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecordIncomeForm(true)}
            >
              Record income
            </Button>
            <Button
              size="sm"
              onClick={() => setRecordForm(true)}
            >
              Record expense
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="This month"
          value={formatMoney({ minor: monthTotal, currency: BASE_CURRENCY })}
          hint={`${thisMonth.length} recorded`}
        />
        <StatCard label="Shown total" value={formatMoney(summary.total)} />
        <StatCard label="Average expense" value={formatMoney(summary.average)} />
        <StatCard label="Categories used" value={String(categoriesPresent.length)} />
      </div>

      <SectionCard title="Spend by category">
        {summary.byCategory.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No expenses recorded yet. Recorded expenses appear here and in the ledger immediately.
          </p>
        ) : (
          <DataTable
            rows={summary.byCategory}
            rowKey={(row) => row.category}
            columns={[
              {
                header: "Category",
                cell: (row) => <span className="font-medium">{row.label}</span>,
              },
              {
                header: "Account",
                cell: (row) => <span className="tabular text-xs">{row.accountCode}</span>,
              },
              { header: "Entries", align: "right", cell: (row) => String(row.count) },
              { header: "Total", align: "right", cell: (row) => formatMoney(row.total) },
              {
                header: "Share",
                align: "right",
                cell: (row) =>
                  summary.total.minor === 0n
                    ? "—"
                    : `${Number((row.total.minor * 1000n) / summary.total.minor) / 10}%`,
              },
            ]}
          />
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Expense register"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void expenses.refetch()}
              disabled={expenses.isFetching}
            >
              {expenses.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <select
              className="rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory | "all")}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {categoriesPresent.map((value) => (
                <option key={value} value={value}>
                  {EXPENSE_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {expenses.isPending && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading expenses…</p>
          )}
          {expenses.isError && (
            <div className="space-y-2 px-4 py-6 text-sm">
              <p className="text-destructive">Could not load expenses: {expenses.error.message}</p>
              <p className="text-muted-foreground">
                If this is a new deployment, apply the Phase 8 migration in Supabase.
              </p>
              <Button variant="outline" size="sm" onClick={() => void expenses.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {!expenses.isPending && !expenses.isError && visibleRows.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {category === "all" ? "No expenses recorded yet." : "No expenses in this category."}
            </p>
          )}
          {visibleRows.length > 0 && <ExpenseTable rows={visibleRows} branchNames={branchNames} />}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Income register"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void incomes.refetch()}
              disabled={incomes.isFetching}
            >
              {incomes.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          }
        >
          {incomes.isPending && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading income…</p>
          )}
          {incomes.isError && (
            <div className="space-y-2 px-4 py-6 text-sm">
              <p className="text-destructive">Could not load income: {incomes.error.message}</p>
              <p className="text-muted-foreground">
                If this is a new deployment, apply the other income migration in Supabase.
              </p>
              <Button variant="outline" size="sm" onClick={() => void incomes.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {!incomes.isPending && !incomes.isError && incomeRows.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No income recorded yet.
            </p>
          )}
          {incomeRows.length > 0 && <IncomeTable rows={incomeRows} branchNames={branchNames} />}
        </SectionCard>
      </div>

      <PlannedNext
        features={[
          "Expense approvals before posting",
          "Profit and loss statement",
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Company-wide profit and loss lives in Reports, computed from the same ledger postings.
      </p>

      <ExpenseDialog
        branches={branchOptions}
        open={recordForm}
        saving={save.isPending}
        onOpenChange={setRecordForm}
        onSave={(values) => save.mutate(values)}
      />
      <IncomeDialog
        branches={branchOptions}
        open={recordIncomeForm}
        saving={saveIncome.isPending}
        onOpenChange={setRecordIncomeForm}
        onSave={(values) => saveIncome.mutate(values)}
      />
    </AppShell>
  );
}

function ExpenseTable({
  rows,
  branchNames,
}: {
  rows: ExpenseRecord[];
  branchNames: Map<string, string>;
}) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      columns={[
        { header: "Date", cell: (row) => day(row.expenseDate) },
        { header: "Category", cell: (row) => EXPENSE_CATEGORY_LABELS[row.category] },
        { header: "Description", cell: (row) => row.description },
        { header: "Paid from", cell: (row) => PAYMENT_SOURCE_LABELS[row.paidFrom] },
        { header: "Branch", cell: (row) => branchNames.get(row.branchId) ?? "—" },
        { header: "Reference", cell: (row) => row.reference || "—" },
        { header: "Amount", align: "right", cell: (row) => formatMoney(row.amount) },
      ]}
    />
  );
}

function IncomeTable({
  rows,
  branchNames,
}: {
  rows: IncomeRecord[];
  branchNames: Map<string, string>;
}) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      columns={[
        { header: "Date", cell: (row) => day(row.incomeDate) },
        { header: "Category", cell: (row) => INCOME_CATEGORY_LABELS[row.category] },
        { header: "Description", cell: (row) => row.description },
        { header: "Received into", cell: (row) => INCOME_RECEIPT_SOURCE_LABELS[row.receivedInto] },
        { header: "Branch", cell: (row) => branchNames.get(row.branchId) ?? "—" },
        { header: "Reference", cell: (row) => row.reference || "—" },
        { header: "Amount", align: "right", cell: (row) => formatMoney(row.amount) },
      ]}
    />
  );
}
