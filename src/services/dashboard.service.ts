/**
 * Dashboard data service.
 *
 * Everything here is derived from posted journal entries. There is no demo or
 * placeholder data: an empty ledger produces zeros and empty states.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BASE_CURRENCY } from "@/domain/currency";
import { ACCOUNT_TYPES, type AccountType } from "@/domain/ledger";
import { money, type Money } from "@/domain/money";
import { buildMonthlyFlow, type MonthlyFlowPoint } from "@/domain/dashboard";
import {
  listAccountBalances,
  listRecentEntries,
  toMoney,
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

export interface DashboardSnapshot extends DashboardCore {
  asOf: string;
  /** Last six months, oldest first. */
  flow: MonthlyFlowPoint[];
}

export interface DashboardCore {
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

export function buildDashboardSnapshot(input: DashboardInput): DashboardCore {
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

/** Oldest first, so the chart runs left to right. */
function recentMonthKeys(count: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    keys.push(date.toISOString().slice(0, 7));
  }
  return keys;
}

interface FlowEntryRow {
  id: string;
  entry_date: string;
}

interface FlowAccountRow {
  id: string;
  type: string;
}

interface FlowLineRow {
  entry_id: string;
  account_id: string;
  side: string;
  amount: string | number;
}

const ACCOUNT_TYPE_SET = new Set<string>(ACCOUNT_TYPES);

async function loadFlow(months: readonly string[]): Promise<MonthlyFlowPoint[]> {
  const from = `${months[0]}-01`;

  const [entryResult, accountResult] = await Promise.all([
    supabase.from("journal_entries").select("id, entry_date").gte("entry_date", from),
    supabase.from("accounts").select("id, type"),
  ]);
  if (entryResult.error) throw new Error(entryResult.error.message);
  if (accountResult.error) throw new Error(accountResult.error.message);

  const entries = (entryResult.data ?? []) as unknown as FlowEntryRow[];
  const accounts = ((accountResult.data ?? []) as unknown as FlowAccountRow[]).filter((account) =>
    ACCOUNT_TYPE_SET.has(account.type),
  );

  let lines: FlowLineRow[] = [];
  if (entries.length > 0) {
    const lineResult = await supabase
      .from("journal_lines")
      .select("entry_id, account_id, side, amount")
      .in(
        "entry_id",
        entries.map((entry) => entry.id),
      );
    if (lineResult.error) throw new Error(lineResult.error.message);
    lines = (lineResult.data ?? []) as unknown as FlowLineRow[];
  }

  return buildMonthlyFlow({
    months,
    entries: entries.map((entry) => ({ id: entry.id, entryDate: entry.entry_date })),
    accounts: accounts.map((account) => ({
      id: account.id,
      type: account.type as AccountType,
    })),
    lines: lines
      .filter((line) => line.side === "debit" || line.side === "credit")
      .map((line) => ({
        entryId: line.entry_id,
        accountId: line.account_id,
        side: line.side as "debit" | "credit",
        amount: toMoney(line.amount).minor,
      })),
  });
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const months = recentMonthKeys(6);

  const [balances, entries, branchResult, countResult, flow] = await Promise.all([
    listAccountBalances(),
    listRecentEntries(10),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("journal_entries").select("id", { count: "exact", head: true }),
    loadFlow(months),
  ]);

  if (branchResult.error) throw new Error(branchResult.error.message);
  if (countResult.error) throw new Error(countResult.error.message);

  return {
    asOf: new Date().toISOString(),
    flow,
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
