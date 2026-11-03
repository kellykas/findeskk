/**
 * Other income rules.
 *
 * Non-automatic income (service charges, miscellaneous income) posts a
 * balanced journal entry: cash/bank is debited and the income account is
 * credited.
 */
import { z } from "zod";
import { BASE_CURRENCY } from "./currency";
import { todayUtcDate } from "./date";
import { parseLedgerAmount } from "./ledger";
import { add, formatMoney, money, type Money } from "./money";

export const INCOME_CATEGORIES = ["service_charges", "other_income"] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  service_charges: "Service charges",
  other_income: "Other income",
};

export const INCOME_CATEGORY_ACCOUNTS: Record<IncomeCategory, string> = {
  service_charges: "4200",
  other_income: "4900",
};

export const INCOME_RECEIPT_SOURCES = ["cash", "bank"] as const;

export type IncomeReceiptSource = (typeof INCOME_RECEIPT_SOURCES)[number];

export const INCOME_RECEIPT_SOURCE_LABELS: Record<IncomeReceiptSource, string> = {
  cash: "Cash on hand",
  bank: "Bank account",
};

const CATEGORY_SET = new Set<string>(INCOME_CATEGORIES);
const SOURCE_SET = new Set<string>(INCOME_RECEIPT_SOURCES);

export function isIncomeCategory(value: string): value is IncomeCategory {
  return CATEGORY_SET.has(value);
}

export function isIncomeReceiptSource(value: string): value is IncomeReceiptSource {
  return SOURCE_SET.has(value);
}

export interface IncomeRecord {
  id: string;
  incomeDate: string;
  category: IncomeCategory;
  description: string;
  amount: Money;
  receivedInto: IncomeReceiptSource;
  branchId: string;
  reference: string;
  notes: string;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const incomeSchema = z.object({
  incomeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
    .refine((value) => value <= todayUtcDate(), "Income date cannot be in the future"),
  category: z.enum(INCOME_CATEGORIES),
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
  receivedInto: z.enum(INCOME_RECEIPT_SOURCES),
  branchId: z.string().min(1, "Select a branch"),
  reference: z.string().trim().max(40, "Reference can have at most 40 characters"),
  notes: z.string().trim().max(300, "Notes can have at most 300 characters"),
});

export type IncomeInput = z.infer<typeof incomeSchema>;

export function parseIncomeAmount(value: string): Money | null {
  const parsed = parseLedgerAmount(value);
  return parsed && parsed.minor > 0n ? parsed : null;
}

export function incomeErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("schema cache") || text.includes("could not find the table"))
    return "The incomes table is missing. Apply the other income migration in Supabase.";
  if (text.includes("cannot record income")) return "Your roles cannot record income.";
  if (text.includes("not assigned to this branch")) return "You are not assigned to that branch.";
  if (text.includes("unknown income category")) return "Choose an income category.";
  if (text.includes("received into cash or bank")) return "Choose cash or bank as the deposit source.";
  if (text.includes("income date cannot be in the future"))
    return "Income date cannot be in the future.";
  if (text.includes("invalid or inactive branch")) return "Select an active branch.";
  if (text.includes("staff profile not found")) return "Your staff profile is inactive.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Your roles cannot read or record income.";
  if (text.includes("duplicate key") || text.includes("unique"))
    return "That income was already recorded.";
  return message;
}
