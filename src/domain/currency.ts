/**
 * Currency metadata. In Phase 2 the list of active currencies moves to the
 * database (configurable by administrators); this registry only supplies
 * formatting defaults. Exchange rates are NEVER defined here.
 */
export type CurrencyCode = "UGX" | "USD" | "EUR" | "GBP" | "KES" | (string & {});

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  /** Number of minor-unit digits used for storage and display. */
  decimals: number;
}

const REGISTRY: Record<string, CurrencyInfo> = {
  UGX: { code: "UGX", name: "Ugandan Shilling", decimals: 0 },
  USD: { code: "USD", name: "US Dollar", decimals: 2 },
  EUR: { code: "EUR", name: "Euro", decimals: 2 },
  GBP: { code: "GBP", name: "Pound Sterling", decimals: 2 },
  KES: { code: "KES", name: "Kenyan Shilling", decimals: 2 },
};

export const BASE_CURRENCY: CurrencyCode = "UGX";

export function getCurrency(code: CurrencyCode): CurrencyInfo {
  return REGISTRY[code] ?? { code, name: code, decimals: 2 };
}
