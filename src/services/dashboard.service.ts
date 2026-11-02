/**
 * Dashboard data service.
 *
 * Everything here is derived from posted journal entries. There is no demo or
 * placeholder data: an empty ledger produces zeros and empty states.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BASE_CURRENCY } from "@/domain/currency";
import type { AccountType } from "@/domain/ledger";
import { money, type Money } from "@/domain/money";
import {
  listAccountBalances,
  listRecentEntries,
  type JournalEntry,
  type LedgerAccountBalance,
} from "./ledger.service";

export interface DashboardTotal {
  label: string;
  type: AccountType;
  amount: Money;
}

export interface CashLine {
  code: string;
  label: string;
  kind: "physical_cash" | "bank" | "electronic_float";
  amount: Money;
}

export interface BranchActivity {
  branch: string;
  postings: number;
  value: Money;
}

export interface DashboardSnapshot {
  asOf: string;
  totalPostings: number;
  hasData: boolean;
  totals: DashboardTotal[];
  cash: CashLine[];
  balances: { code: string; name: string; type: AccountType; balance: Money }[];
  recent: JournalEntry[];
  branches: BranchActivity[];
}

/** Accounts shown in the cash & float strip, with how they are grouped. */
export const CASH_ACCOUNTS: Record<string, CashLine["kind"]> = {
  "1000": "physical_cash",
  "1010": "physical_cash",
  "1100": "bank",
  "1110": "electronic_float",
  "1120": "electronic_float",
};

const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "income", "expense"];

const zero = () => money(0n, BASE_CURRENCY);

function addMoney(a: Money, b: Money): Money {
  return money(a.minor + b.minor, BASE_CURRENCY);
}

export interface DashboardInput {
  balances: LedgerAccountBalance[];
  entries: JournalEntry[];
  branches: { id: string; name: string }[];
  totalPostings: number;
}

export function buildDashboardSnapshot(input: DashboardInput): Omit<DashboardSnapshot, "asOf"> {
  const typeTotals = new Map<AccountType, Money>();
  for (const type of TYPE_ORDER) typeTotals.set(type, zero());

  for (const account of input.balances) {
    const current = typeTotals.get(account.type) ?? zero();
    typeTotals.set(account.type, addMoney(current, account.balance));
  }

  const totals = TYPE_ORDER.map((type) => ({
    label: TYPE_LABELS[type],
    type,
    amount: typeTotals.get(type) ?? zero(),
  }));

  const cash: CashLine[] = input.balances
    .filter((account) => CASH_ACCOUNTS[account.code] !== undefined)
    .map((account) => ({
      code: account.code,
      label: account.name,
      kind: CASH_ACCOUNTS[account.code] ?? "physical_cash",
      amount: account.balance,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const balances = input.balances
    .filter((account) => account.debit.minor !== 0n || account.credit.minor !== 0n)
    .map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      balance: account.balance,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const branchNames = new Map(input.branches.map((branch) => [branch.id, branch.name]));
  const activity = new Map<string, BranchActivity>();
  for (const entry of input.entries) {
    const name = entry.branchId
      ? (branchNames.get(entry.branchId) ?? "Unknown branch")
      : "Head office";
    const current = activity.get(name) ?? { branch: name, postings: 0, value: zero() };
    activity.set(name, {
      branch: name,
      postings: current.postings + 1,
      value: addMoney(current.value, entry.debitTotal),
    });
  }

  const hasData =
    input.totalPostings > 0 ||
    input.entries.length > 0 ||
    balances.length > 0 ||
    cash.some((line) => line.amount.minor !== 0n);

  return {
    totalPostings: input.totalPostings,
    hasData,
    totals,
    cash,
    balances,
    recent: input.entries,
    branches: [...activity.values()].sort((a, b) =>
      a.value.minor === b.value.minor ? 0 : a.value.minor < b.value.minor ? 1 : -1,
    ),
  };
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [balances, entries, branchResult, countResult] = await Promise.all([
    listAccountBalances(),
    listRecentEntries(10),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("journal_entries").select("id", { count: "exact", head: true }),
  ]);

  if (branchResult.error) throw new Error(branchResult.error.message);
  if (countResult.error) throw new Error(countResult.error.message);

  return {
    asOf: new Date().toISOString(),
    ...buildDashboardSnapshot({
      balances,
      entries,
      branches: branchResult.data ?? [],
      totalPostings: countResult.count ?? 0,
    }),
  };
}

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard", "snapshot"],
  queryFn: getDashboardSnapshot,
  staleTime: 15_000,
});
