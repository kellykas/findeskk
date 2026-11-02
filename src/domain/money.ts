/**
 * Money primitives.
 *
 * Amounts are held as bigint *minor units* (e.g. cents) so no JavaScript
 * floating-point arithmetic is ever used. This module is for display and
 * client-side previews ONLY — authoritative calculations and ledger postings
 * happen in PostgreSQL (NUMERIC) via secure database functions (Phase 3).
 */
import { getCurrency, type CurrencyCode } from "./currency";

export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

export function money(minor: bigint, currency: CurrencyCode): Money {
  return { minor, currency };
}

/** Parse a decimal string such as "1250.50" into Money. Throws on invalid input. */
export function parseMoney(input: string, currency: CurrencyCode): Money {
  const { decimals } = getCurrency(currency);
  const clean = input.trim().replace(/,/g, "");
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(clean);
  if (!match) throw new Error(`Invalid amount: "${input}"`);
  const [, sign, whole, frac = ""] = match;
  if (frac.length > decimals) {
    throw new Error(`${currency} allows at most ${decimals} decimal places`);
  }
  const minor = BigInt(whole + frac.padEnd(decimals, "0") || "0");
  return money(sign ? -minor : minor, currency);
}

function assertSame(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function sum(items: Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), money(0n, currency));
}

export function isNegative(m: Money): boolean {
  return m.minor < 0n;
}

/** Plain decimal string for storage/transport, e.g. "1250000" or "1250.50". */
export function toDecimalString(m: Money): string {
  const { decimals } = getCurrency(m.currency);
  const negative = m.minor < 0n;
  const abs = (negative ? -m.minor : m.minor).toString().padStart(decimals + 1, "0");
  const body = decimals ? `${abs.slice(0, -decimals)}.${abs.slice(-decimals)}` : abs;
  return `${negative ? "-" : ""}${body}`;
}

/** Format as "UGX 1,250,000" / "USD 1,250.50" without floating point. */
export function formatMoney(m: Money, opts: { showCode?: boolean } = {}): string {
  const { decimals } = getCurrency(m.currency);
  const negative = m.minor < 0n;
  const abs = (negative ? -m.minor : m.minor).toString().padStart(decimals + 1, "0");
  const whole = decimals ? abs.slice(0, -decimals) : abs;
  const frac = decimals ? abs.slice(-decimals) : "";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac ? `${grouped}.${frac}` : grouped;
  const code = opts.showCode === false ? "" : `${m.currency} `;
  return `${negative ? "-" : ""}${code}${body}`;
}
