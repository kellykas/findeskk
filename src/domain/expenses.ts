/**
 * Expense rules and summaries.
 *
 * The database posts every expense through record_expense(), which debits the
 * category's expense account and credits cash or bank in one atomic journal
 * entry. The helpers here only validate the form and total what was posted.
 */
import { z } from "zod";
import { BASE_CURRENCY } from "./currency";
import { todayUtcDate } from "./date";
import { parseLedgerAmount } from "./ledger";
import { add, formatMoney, money, type Money } from "./money";

export const EXPENSE_CATEGORIES = [
  "salaries",
  "rent",
  "utilities",
  "transport",
  "licences",
  "bank_charges",
  "cash_shortage",
  "misc",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salaries: "Salaries and wages",
  rent: "Rent",
  utilities: "Utilities",
  transport: "Transport and fuel",
  licences: "Licences and regulatory fees",
  bank_charges: "Bank charges",
  cash_shortage: "Cash shortages",
  misc: "Miscellaneous",
};

/** Chart-of-accounts code each category debits (seeded in the ledger migration). */
export const EXPENSE_CATEGORY_ACCOUNTS: Record<ExpenseCategory, string> = {
  salaries: "5000",
  rent: "5100",
  utilities: "5200",
  transport: "5300",
  licences: "5400",
  bank_charges: "5500",
  cash_shortage: "5600",
  misc: "5900",
};

export const PAYMENT_SOURCES = ["cash", "bank"] as const;

export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  cash: "Cash on hand",
  bank: "Bank account",
};

const CATEGORY_SET = new Set<string>(EXPENSE_CATEGORIES);
const SOURCE_SET = new Set<string>(PAYMENT_SOURCES);

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return CATEGORY_SET.has(value);
}

export function isPaymentSource(value: string): value is PaymentSource {
  return SOURCE_SET.has(value);
}

export interface ExpenseRecord {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: Money;
  paidFrom: PaymentSource;
  branchId: string;
  reference: string;
  notes: string;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const expenseSchema = z.object({
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((value) => value <= todayUtcDate(), "Expense date cannot be in the future"),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z
    .string()
    .trim()
    .min(4, "Description needs at least 4 characters")
    .max(200, "Description can have at most 200 characters"),
  amount: z
    .string()
    .trim()
    .refine((value) => {
      const parsed = parseLedgerAmount(value);
      return parsed !== null && parsed.currency === BASE_CURRENCY && parsed.minor > 0n;
    }, "Enter an amount greater than zero"),
  paidFrom: z.enum(PAYMENT_SOURCES),
  branchId: z.string().min(1, "Select a branch"),
  reference: z.string().trim().max(40, "Reference can have at most 40 characters"),
  notes: z.string().trim().max(300, "Notes can have at most 300 characters"),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export function parseExpenseAmount(value: string): Money | null {
  const parsed = parseLedgerAmount(value);
  return parsed && parsed.minor > 0n ? parsed : null;
}

export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  label: string;
  accountCode: string;
  count: number;
  total: Money;
}

export interface ExpenseSummary {
  count: number;
  total: Money;
  average: Money;
  byCategory: ExpenseCategoryTotal[];
  bySource: { source: PaymentSource; label: string; total: Money }[];
}

/** Totals by category and payment source; categories with no spend are omitted. */
export function buildExpenseSummary(records: readonly ExpenseRecord[]): ExpenseSummary {
  const zero = () => money(0n, BASE_CURRENCY);
  const categories = new Map<ExpenseCategory, ExpenseCategoryTotal>();
  const sources = new Map<PaymentSource, Money>();
  let total = zero();

  for (const record of records) {
    total = add(total, record.amount);
    const current = categories.get(record.category) ?? {
      category: record.category,
      label: EXPENSE_CATEGORY_LABELS[record.category],
      accountCode: EXPENSE_CATEGORY_ACCOUNTS[record.category],
      count: 0,
      total: zero(),
    };
    current.count += 1;
    current.total = add(current.total, record.amount);
    categories.set(record.category, current);

    sources.set(record.paidFrom, add(sources.get(record.paidFrom) ?? zero(), record.amount));
  }

  const byCategory = [...categories.values()].sort((a, b) =>
    a.total.minor === b.total.minor ? 0 : a.total.minor < b.total.minor ? 1 : -1,
  );

  return {
    count: records.length,
    total,
    average: money(records.length === 0 ? 0n : total.minor / BigInt(records.length), BASE_CURRENCY),
    byCategory,
    bySource: PAYMENT_SOURCES.map((source) => ({
      source,
      label: PAYMENT_SOURCE_LABELS[source],
      total: sources.get(source) ?? zero(),
    })).filter((entry) => entry.total.minor !== 0n),
  };
}

export function formatExpenseTotal(summary: ExpenseSummary): string {
  return formatMoney(summary.total);
}

/** Inclusive date-range filter on the expense date (ISO strings compare lexically). */
export function filterExpenses(
  records: readonly ExpenseRecord[],
  range: { from?: string; to?: string },
): ExpenseRecord[] {
  return records.filter((record) => {
    if (range.from && record.expenseDate < range.from) return false;
    if (range.to && record.expenseDate > range.to) return false;
    return true;
  });
}
