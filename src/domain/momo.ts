/**
 * Mobile money rules: validation and previews for manually recorded agency
 * transactions.
 *
 * The network reference is typed in by staff — it is never network-verified
 * and must never be shown as if the network confirmed it. The networks on offer
 * are rows the company manages; the database rejects one that is switched off.
 * Authoritative money math happens in PostgreSQL inside
 * record_momo_transaction(); the helpers here only preview the same result for
 * the form.
 */
import { z } from "zod";
import { BASE_CURRENCY } from "./currency";
import { todayUtcDate } from "./date";
import { foreignValueOfUgx } from "./forex";
import { parseLedgerAmount } from "./ledger";
import { add, money, subtract, type Money } from "./money";

/**
 * Networks are company-managed reference data (public.momo_networks), so a
 * network is an opaque code rather than a fixed list. The two seeded networks
 * keep a friendly fallback label for records shown without joining the table.
 */
export const MOMO_NETWORK_LABELS: Record<string, string> = {
  mtn: "MTN",
  airtel: "Airtel",
};
export type MomoNetwork = string;

/** Display label for a network code, falling back to the code itself. */
export function momoNetworkLabel(code: string): string {
  return MOMO_NETWORK_LABELS[code] ?? code.toUpperCase();
}

export const MOMO_TYPES = ["deposit", "withdrawal"] as const;
export type MomoType = (typeof MOMO_TYPES)[number];
export const MOMO_TYPE_LABELS: Record<MomoType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UGX amount for the ledger. A foreign deposit's UGX value is its buy-rate equivalent. */
function amountField(message: string, allowZero: boolean) {
  return z
    .string()
    .trim()
    .refine((value) => {
      const parsed = parseLedgerAmount(value);
      if (!parsed || parsed.currency !== BASE_CURRENCY) return false;
      return allowZero ? parsed.minor >= 0n : parsed.minor > 0n;
    }, message);
}

/** Foreign amount typed in a published currency, e.g. USD 100 (any 2-decimal amount above zero). */
export const MOMO_FOREIGN_AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

export const momoSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/, "Choose a currency")
      .default(BASE_CURRENCY),
    foreignAmount: z.string().trim().default(""),
    network: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{2,20}$/, "Choose a mobile money network"),
    type: z.enum(MOMO_TYPES),
    amount: amountField("Enter an amount greater than zero", false),
    commission: amountField("Enter a valid commission (0 or more)", true),
    branchId: z.string().min(1, "Select a branch"),
    customerId: z
      .string()
      .refine((value) => value === "" || UUID.test(value), "Select a valid customer"),
    customerRef: z.string().trim().max(80, "Customer reference can have at most 80 characters"),
    networkRef: z.string().trim().max(40, "Network reference can have at most 40 characters"),
    notes: z.string().trim().max(300, "Notes can have at most 300 characters"),
    entryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
      .refine((value) => value <= todayUtcDate(), "Entry date cannot be in the future"),
  })
  .refine(
    (data) =>
      data.currency === BASE_CURRENCY ||
      (MOMO_FOREIGN_AMOUNT.test(data.foreignAmount) && Number(data.foreignAmount) > 0),
    { message: "Enter a foreign amount greater than zero", path: ["foreignAmount"] },
  )
  .refine(
    (data) =>
      data.type !== "withdrawal" ||
      (parseLedgerAmount(data.amount)?.minor ?? 0n) >
        (parseLedgerAmount(data.commission)?.minor ?? 0n),
    { message: "Commission must be less than the withdrawal amount", path: ["commission"] },
  );
export type MomoInput = z.infer<typeof momoSchema>;

/**
 * A reversal always states why. Four characters is enough to rule out an empty
 * or accidental confirmation while staying usable for a busy teller.
 */
export const momoReversalSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(4, "Give a short reason (at least 4 characters)")
    .max(300, "Reason can have at most 300 characters"),
});
export type MomoReversalInput = z.infer<typeof momoReversalSchema>;

/**
 * Cash moved by the transaction, commission included:
 * deposit → the customer hands over amount + commission;
 * withdrawal → the customer is paid amount − commission.
 */
export function momoCashMovement(type: MomoType, amount: Money, commission: Money): Money {
  return type === "deposit" ? add(amount, commission) : subtract(amount, commission);
}

/** A transaction's amounts in the currency the customer actually paid. */
export interface MomoForeignAmounts {
  amount: Money;
  commission: Money;
  cash: Money;
}

/**
 * The same deposit or withdrawal in a foreign currency, restored from the UGX
 * ledger values at the transaction's rate. Screens and receipts show these so a
 * USD deposit is never presented as if the customer paid shillings.
 */
export function momoForeignAmounts(input: {
  type: MomoType;
  amount: Money;
  commission: Money;
  currency: string;
  rate: string;
}): MomoForeignAmounts | null {
  const amount = foreignValueOfUgx(input.amount, input.rate, input.currency);
  const commission = foreignValueOfUgx(input.commission, input.rate, input.currency);
  const cash = foreignValueOfUgx(
    momoCashMovement(input.type, input.amount, input.commission),
    input.rate,
    input.currency,
  );
  if (!amount || !commission || !cash) return null;
  return { amount, commission, cash };
}

/**
 * The percentage a recorded commission represents of its amount, so a correction
 * opens with the same terms rather than a blank fee. The rate is rounded to the
 * three decimals the form accepts; the preview then shows the money it produces,
 * so nothing changes unseen. Returns null when the amount cannot carry a rate.
 */
export function commissionPercentOf(amount: Money, commission: Money): string | null {
  if (amount.minor <= 0n) return null;
  const thousandths = (commission.minor * 100_000n + amount.minor / 2n) / amount.minor;
  if (thousandths < 0n || thousandths > 100_000n) return null;
  const whole = thousandths / 1000n;
  const fraction = (thousandths % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * Commission taken as a percentage of the amount, rounded to the nearest minor
 * unit (half up). Networks such as MPESA and Airtel Money in the DRC deduct a
 * rate — 3 % is usual — so the teller types the rate and the deduction follows.
 *
 * Everything is integer maths: 3 % of a large withdrawal must land on the same
 * shilling as the same rate worked out on paper, which floats cannot promise.
 * Returns null when the text is not a percentage the form can use.
 */
export function commissionForPercent(amount: Money, percent: string): Money | null {
  const value = percent.trim();
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  // Thousandths of a percent, so "3", "2.5" and "0.125" all stay exact.
  const thousandths = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (thousandths > 100_000n) return null;
  const rounded = (amount.minor * thousandths + 50_000n) / 100_000n;
  return money(rounded, amount.currency);
}
