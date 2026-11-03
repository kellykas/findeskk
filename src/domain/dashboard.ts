/**
 * Dashboard aggregation.
 *
 * Pure: the caller supplies posted lines and the month buckets to fill, so this
 * module never reads the clock and stays deterministic under test. Amounts stay
 * in bigint minor units; only the display percentage converts to a number.
 */
import { BASE_CURRENCY } from "./currency";
import type { AccountType } from "./ledger";
import { money, type Money } from "./money";

export interface FlowEntry {
  id: string;
  /** ISO date (YYYY-MM-DD); only the year and month are used. */
  entryDate: string;
}

export interface FlowAccount {
  id: string;
  type: AccountType;
}

export interface FlowLine {
  entryId: string;
  accountId: string;
  side: "debit" | "credit";
  /** Absolute amount in minor units. */
  amount: bigint;
}

export interface MonthlyFlowPoint {
  /** YYYY-MM */
  month: string;
  label: string;
  income: Money;
  expense: Money;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Short month name. Fixed table rather than Intl: ICU renders September as
 * "Sept" in en-GB and "Sep" elsewhere, which would make axis labels and tests
 * depend on the host.
 */
export function monthLabel(monthKey: string): string {
  const month = Number(monthKey.split("-")[1]);
  return MONTH_LABELS[month - 1] ?? monthKey;
}

/**
 * Income and expense per month, in the order the caller listed the months.
 * Income accounts increase on credits, expense accounts increase on debits, so
 * a reversal line correctly reduces the month it was posted in.
 */
export function buildMonthlyFlow(input: {
  entries: readonly FlowEntry[];
  accounts: readonly FlowAccount[];
  lines: readonly FlowLine[];
  months: readonly string[];
}): MonthlyFlowPoint[] {
  const typeById = new Map(input.accounts.map((account) => [account.id, account.type]));
  const monthByEntry = new Map(
    input.entries.map((entry) => [entry.id, entry.entryDate.slice(0, 7)]),
  );

  const income = new Map<string, bigint>();
  const expense = new Map<string, bigint>();

  for (const line of input.lines) {
    const month = monthByEntry.get(line.entryId);
    if (!month) continue;
    const type = typeById.get(line.accountId);
    if (type === "income") {
      const delta = line.side === "credit" ? line.amount : -line.amount;
      income.set(month, (income.get(month) ?? 0n) + delta);
    } else if (type === "expense") {
      const delta = line.side === "debit" ? line.amount : -line.amount;
      expense.set(month, (expense.get(month) ?? 0n) + delta);
    }
  }

  return input.months.map((month) => ({
    month,
    label: monthLabel(month),
    income: money(income.get(month) ?? 0n, BASE_CURRENCY),
    expense: money(expense.get(month) ?? 0n, BASE_CURRENCY),
  }));
}

/**
 * Percent change from the previous figure, or null when there is nothing to
 * compare against (a percentage against zero is not meaningful).
 */
export function monthOverMonth(current: Money, previous: Money): number | null {
  if (previous.minor === 0n) return null;
  return Number(((current.minor - previous.minor) * 1000n) / previous.minor) / 10;
}

/** "+12.1%" / "-4.0%" for a change, or undefined when there is no comparison. */
export function formatDelta(change: number | null): string | undefined {
  if (change === null || !Number.isFinite(change)) return undefined;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}
