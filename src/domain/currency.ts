/**
 * Currency metadata. Currencies are configured in the database; this registry
 * only supplies display defaults. Exchange rates are NEVER defined here.
 */

export type CurrencyCode = "UGX" | "USD" | "EUR" | "GBP" | "KES" | (string & {});

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  decimals: number;
}

export const CURRENCY_REGISTRY: readonly CurrencyInfo[] = [
  { code: "UGX", name: "Ugandan Shilling", decimals: 0 },
  { code: "USD", name: "US Dollar", decimals: 2 },
  { code: "EUR", name: "Euro", decimals: 2 },
  { code: "GBP", name: "Pound Sterling", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", decimals: 2 },
];

const BY_CODE = new Map<string, CurrencyInfo>(CURRENCY_REGISTRY.map((c) => [c.code, c]));

export function getCurrency(code: CurrencyCode): CurrencyInfo {
  return BY_CODE.get(code) ?? { code, name: code, decimals: 2 };
}

export const BASE_CURRENCY: CurrencyCode = "UGX";
export const BASECURRENCY: CurrencyCode = BASE_CURRENCY;
