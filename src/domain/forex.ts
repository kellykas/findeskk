/**
 * Forex bureau vocabulary and preview arithmetic.
 *
 * The database is the authority: record_fx_transaction() re-reads the latest
 * published rate, recomputes the UGX amounts in NUMERIC and rejects a stale
 * rate or an unbalanced entry. The helpers here only let the interface show the
 * same numbers before a round trip, using bigint arithmetic (never floats).
 */
import { z } from "zod";
import { BASECURRENCY } from "./currency";
import { money, toDecimalString, type Money } from "./money";

/**
 * Currencies the company trades are managed rows (public.fx_currencies), so a
 * currency is any three letter code the database accepts. This list is only the
 * seed set, kept so features that need a starting point still compile.
 */
export const FX_CURRENCIES = ["USD", "EUR", "GBP", "KES"] as const;

export type FxCurrency = string;

/** Built-in names for the seeded currencies; unlisted codes fall back to the code. */
export const FX_CURRENCY_LABELS: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "Pound Sterling",
  KES: "Kenyan Shilling",
};

/** Display name for a currency, falling back to the code itself. */
export function fxCurrencyLabel(code: string): string {
  return FX_CURRENCY_LABELS[code] ?? code;
}

/** A currency offered in a form: the company-set code and name. */
export interface FxCurrencyOption {
  code: string;
  name: string;
}

const CURRENCY_CODE = /^[A-Z]{3}$/;

/** A three letter code, in upper case, and never the base currency. */
const currencyCodeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CURRENCY_CODE, "Choose a valid three letter currency")
  .refine((code) => code !== "UGX", "UGX is the base currency and is not traded");

export const FX_TYPES = ["buy", "sell"] as const;

export type FxType = (typeof FX_TYPES)[number];

export const FX_TYPE_LABELS: Record<FxType, string> = {
  buy: "Buy",
  sell: "Sell",
};

export const FX_SETTLEMENTS = ["cash", "bank"] as const;

export type FxSettlement = (typeof FX_SETTLEMENTS)[number];

export const FX_SETTLEMENT_LABELS: Record<FxSettlement, string> = {
  cash: "Cash",
  bank: "Bank",
};

/** A published rate. Rates are append-only; the newest row wins. */
export interface FxRate {
  id: string;
  currency: FxCurrency;
  buyRate: string;
  sellRate: string;
  effectiveFrom: string;
  createdAt: string;
}

/** Trim the fixed scale PostgREST returns ("3,720.000000" → "3,720"). */
export function formatRate(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

export const formatRateForDisplay = formatRate;

const RATE_PATTERN = /^\d+(\.\d{1,6})?$/;

export function isValidRate(value: string): boolean {
  return RATE_PATTERN.test(value.trim()) && Number(value) > 0;
}

/** Foreign amounts carry the currency's two decimals; UGX amounts are whole. */
export function parseForeignAmount(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim().replace(/,/g, ""));
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return whole * 100n + BigInt(fraction);
}

function rateMicros(value: string): bigint | null {
  if (!isValidRate(value)) return null;
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}

/** Half-up rounding of n / d for non-negative values. */
function roundDivide(n: bigint, d: bigint): bigint {
  return (n + d / 2n) / d;
}

export interface FxTradePreview {
  ugx: Money;
  cost: Money;
  margin: Money;
}

export function zeroUgx(): Money {
  return money(0n, BASECURRENCY);
}

/**
 * Mirrors record_fx_transaction(): a buy pays UGX at the buy rate for currency
 * inventory (no margin), a sell receives UGX at the sell rate and books the
 * difference against the cost rate as margin.
 */
export function previewTrade(input: {
  type: FxType;
  foreignAmount: string;
  buyRate: string;
  sellRate: string;
}): FxTradePreview | null {
  const foreign = parseForeignAmount(input.foreignAmount);
  const buy = rateMicros(input.buyRate);
  const sell = rateMicros(input.sellRate);
  if (foreign === null || foreign <= 0n || buy === null || sell === null) return null;

  const tradeRate = input.type === "buy" ? buy : sell;
  const ugxMinor = roundDivide(foreign * tradeRate, 100_000_000n);
  const costMinor = roundDivide(foreign * buy, 100_000_000n);

  return {
    ugx: money(ugxMinor, BASECURRENCY),
    cost: money(costMinor, BASECURRENCY),
    margin: money(ugxMinor - costMinor, BASECURRENCY),
  };
}

/**
 * The published rate that prices this side of a trade: a buy pays UGX at the
 * buy rate, a sell receives UGX at the sell rate. record_fx_transaction()
 * rejects a trade priced off the other side, so this is the rate to send.
 */
export function tradeRateFor(type: FxType, rate: { buyRate: string; sellRate: string }): string {
  return type === "buy" ? rate.buyRate : rate.sellRate;
}

export const fxSchema = z.object({
  type: z.enum(FX_TYPES),
  currency: currencyCodeField,
  foreignAmount: z
    .string()
    .trim()
    .refine((value) => {
      const parsed = parseForeignAmount(value);
      return parsed !== null && parsed > 0n;
    }, "Enter a foreign amount greater than zero"),
  settlement: z.enum(FX_SETTLEMENTS),
  branchId: z.string().min(1, "Choose a branch"),
  customerRef: z.string().max(80, "Customer reference can have at most 80 characters"),
  receiptNo: z.string().max(40, "Receipt number can have at most 40 characters"),
  notes: z.string().max(300, "Notes can have at most 300 characters"),
  entryDate: z.string().min(10, "Choose an entry date"),
});

export type FxTradeInput = z.infer<typeof fxSchema>;

export const fxRateSchema = z
  .object({
    currency: currencyCodeField,
    buyRate: z.string().trim().refine(isValidRate, "Enter a buy rate greater than zero"),
    sellRate: z.string().trim().refine(isValidRate, "Enter a sell rate greater than zero"),
    effectiveFrom: z.string().min(10, "Choose an effective date"),
  })
  .refine(
    (value) => rateMicros(value.sellRate)! >= rateMicros(value.buyRate)!,
    "The sell rate must be at least the buy rate",
  );

export type FxRateInput = z.infer<typeof fxRateSchema>;

/** Decimal string for the RPC parameters. */
export function formatForeignAmountForRpc(value: string): string {
  const parsed = parseForeignAmount(value);
  if (parsed === null) throw new Error("Invalid foreign amount");
  return toDecimalString(money(parsed, "USD"));
}
