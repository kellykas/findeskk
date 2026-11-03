/**
 * Mobile money rules: validation and previews for manually recorded agency
 * transactions.
 *
 * The network reference is typed in by staff — it is never network-verified
 * and must never be shown as if the network confirmed it. Authoritative money
 * math happens in PostgreSQL inside record_momo_transaction(); the helpers here
 * only preview the same result for the form.
 */
import { z } from "zod";
import { BASE_CURRENCY } from "./currency";
import { todayUtcDate } from "./date";
import { parseLedgerAmount } from "./ledger";
import { add, subtract, type Money } from "./money";

export const MOMO_NETWORKS = ["mtn", "airtel"] as const;
export type MomoNetwork = (typeof MOMO_NETWORKS)[number];
export const MOMO_NETWORK_LABELS: Record<MomoNetwork, string> = {
  mtn: "MTN",
  airtel: "Airtel",
};

export const MOMO_TYPES = ["deposit", "withdrawal"] as const;
export type MomoType = (typeof MOMO_TYPES)[number];
export const MOMO_TYPE_LABELS: Record<MomoType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export const momoSchema = z
  .object({
    network: z.enum(MOMO_NETWORKS),
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
      data.type !== "withdrawal" ||
      (parseLedgerAmount(data.amount)?.minor ?? 0n) >
        (parseLedgerAmount(data.commission)?.minor ?? 0n),
    { message: "Commission must be less than the withdrawal amount", path: ["commission"] },
  );
export type MomoInput = z.infer<typeof momoSchema>;

/**
 * Cash moved by the transaction, commission included:
 * deposit → the customer hands over amount + commission;
 * withdrawal → the customer is paid amount − commission.
 */
export function momoCashMovement(type: MomoType, amount: Money, commission: Money): Money {
  return type === "deposit" ? add(amount, commission) : subtract(amount, commission);
}
