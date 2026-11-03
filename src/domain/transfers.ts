/**
 * Inter-branch currency transfers.
 *
 * A transfer is not a trade: no rate applies, no margin is earned and the
 * company total does not change. The database posts it as one journal entry
 * that debits the destination branch and credits the source branch on the same
 * account (1010 for foreign currency, 1000 for UGX cash), so this module only
 * holds the vocabulary, validation and error translation.
 */
import { z } from "zod";
import { getCurrency } from "./currency";
import { FX_CURRENCIES, FX_CURRENCY_LABELS } from "./forex";
import { money, type Money } from "./money";

/** UGX cash moves between branches too, so it leads the list. */
export const TRANSFER_CURRENCIES = ["UGX", ...FX_CURRENCIES] as const;

export type TransferCurrency = (typeof TRANSFER_CURRENCIES)[number];

export const TRANSFER_CURRENCY_LABELS: Record<TransferCurrency, string> = {
  UGX: "Uganda Shilling",
  ...FX_CURRENCY_LABELS,
};

export interface TransferRecord {
  id: string;
  currency: TransferCurrency;
  amount: Money;
  fromBranchId: string;
  toBranchId: string;
  reference: string;
  notes: string;
  entryDate: string;
  createdAt: string;
}

const CURRENCY_SET = new Set<string>(TRANSFER_CURRENCIES);

export function isTransferCurrency(value: string): value is TransferCurrency {
  return CURRENCY_SET.has(value);
}

/** Parse an amount for the chosen currency: 0 decimals for UGX, 2 otherwise. */
export function parseTransferAmount(value: string, currency: TransferCurrency): Money | null {
  const cleaned = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const { decimals } = getCurrency(currency);
  const [whole = "0", fraction = ""] = cleaned.split(".");
  if (decimals === 0) {
    if (fraction !== "" && Number(fraction) !== 0) return null;
    const amount = BigInt(whole);
    if (amount <= 0n) return null;
    return money(amount, currency);
  }
  const minorStr = `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`;
  const minor = BigInt(minorStr || "0");
  if (minor <= 0n) return null;
  return money(minor, currency);
}

export function transferSchema(currency: TransferCurrency) {
  return z
    .object({
      currency: z.enum(TRANSFER_CURRENCIES),
      amount: z
        .string()
        .trim()
        .refine((value) => {
          const parsed = parseTransferAmount(value, currency);
          return parsed !== null && parsed.minor > 0n;
        }, `Enter an amount greater than zero${getCurrency(currency).decimals === 0 ? " (whole shillings)" : ""}`),
      fromBranchId: z.string().min(1, "Choose the branch sending the currency"),
      toBranchId: z.string().min(1, "Choose the branch receiving the currency"),
      reference: z.string().max(40, "Reference can have at most 40 characters"),
      notes: z.string().max(300, "Notes can have at most 300 characters"),
      entryDate: z.string().min(10, "Choose an entry date"),
    })
    .refine((value) => value.fromBranchId !== value.toBranchId, {
      message: "The source and destination branches must be different",
      path: ["toBranchId"],
    });
}

export type TransferInput = {
  currency: TransferCurrency;
  amount: Money;
  fromBranchId: string;
  toBranchId: string;
  reference: string;
  notes: string;
  entryDate: string;
};

export function transferErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (
    text.includes("cannot find the table") ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  )
    return "Transfers are not enabled in the database yet. Apply the currency transfers migration in Supabase.";
  if (text.includes("cannot transfer currency"))
    return "Your roles cannot transfer currency between branches.";
  if (text.includes("not assigned to both branches"))
    return "You must be assigned to both branches to move currency between them.";
  if (text.includes("must be different"))
    return "The source and destination branches must be different.";
  if (text.includes("greater than zero")) return "Enter an amount greater than zero.";
  if (text.includes("cannot be in the future")) return "Entry date cannot be in the future.";
  if (text.includes("invalid or inactive")) return "Choose two active branches.";
  if (text.includes("too long")) return "One of the text fields is too long.";
  if (text.includes("staff profile not found")) return "Your staff profile is inactive.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  return message;
}

/** Qty for the receipt-style amount column: "1,000.00 USD". */
export function formatTransferAmount(transfer: TransferRecord): string {
  const { decimals } = getCurrency(transfer.currency);
  const negative = transfer.amount.minor < 0n;
  const absolute = negative ? -transfer.amount.minor : transfer.amount.minor;
  const divisor = 10n ** BigInt(decimals);
  const whole = (absolute / divisor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimals === 0) return `${negative ? "-" : ""}${whole} ${transfer.currency}`;
  const fraction = (absolute % divisor).toString().padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole}.${fraction} ${transfer.currency}`;
}
