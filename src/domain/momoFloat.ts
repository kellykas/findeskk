/**
 * Employee mobile money floats.
 *
 * A super admin entrusts part of a network's float to one employee. The money
 * itself stays in the network's float account, so the ledger and every report
 * are unchanged; the allocation limits how much that employee may pay out.
 * A deposit reduces the remaining float and a withdrawal adds to it. The
 * database enforces the limit (private.enforce_momo_staff_float); the helpers
 * here only shape the form and the figures on screen.
 */
import { z } from "zod";

import { getCurrency } from "./currency";
import { money, type Money } from "./money";

export interface StaffFloatPosition {
  userId: string;
  network: string;
  currency: string;
  /** Total given to the employee, in `currency`. */
  allocated: Money;
  /** What they can still pay out, in `currency`. */
  remaining: Money;
}

/** Given minus remaining, never below zero. */
export function usedFloat(position: StaffFloatPosition): Money {
  const used = position.allocated.minor - position.remaining.minor;
  return money(used > 0n ? used : 0n, position.currency);
}

/** A position's own key, so the form can find the float for a network and currency. */
export function positionKey(network: string, currency: string): string {
  return `${network}|${currency}`;
}

/**
 * PostgREST returns numeric columns as text with a fixed scale ("5000.00"), while
 * UGX has no minor unit. This reads either shape without floating point.
 */
export function parseAmount(value: string | number, currency: string): Money {
  const { decimals } = getCurrency(currency);
  const text = String(value ?? "0").trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const minor = `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`.replace(/\D/g, "");
  const parsed = BigInt(minor || "0");
  return money(negative ? -parsed : parsed, currency);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One allocation, in the currency chosen. A negative amount takes float back;
 * zero is refused because it would record nothing.
 */
export function staffFloatSchema(currency: string) {
  const { decimals } = getCurrency(currency);
  const pattern =
    decimals === 0 ? /^-?\d{1,15}$/ : new RegExp(`^-?\\d{1,15}(?:\\.\\d{1,${decimals}})?$`);
  return z.object({
    userId: z.string().regex(UUID, "Choose an employee"),
    network: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{2,20}$/, "Choose a mobile money network"),
    amount: z
      .string()
      .trim()
      .refine(
        (value) => pattern.test(value) && parseAmount(value, currency).minor !== 0n,
        `Enter the float in ${currency}, for example ${decimals === 0 ? "1000000" : "100.00"}`,
      ),
    note: z.string().trim().max(300, "Note can have at most 300 characters"),
  });
}

export type StaffFloatInput = z.infer<ReturnType<typeof staffFloatSchema>>;

export function staffFloatErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("only a super admin can give a float"))
    return "Only a super admin or company owner can give a float.";
  if (text.includes("takes back more float"))
    return "That takes back more float than the employee has left.";
  if (text.includes("unknown staff profile")) return "That employee no longer exists.";
  if (text.includes("unknown or inactive mobile money network"))
    return "That network is switched off. Choose another.";
  if (text.includes("enter a float amount")) return "Enter a float amount other than zero.";
  if (text.includes("note can have at most")) return "Keep the note under 300 characters.";
  if (
    text.includes("could not find the function") ||
    text.includes("schema cache") ||
    text.includes("does not exist")
  ) {
    return "Employee floats need a one-time database setup before they can be used. Ask your administrator to run supabase/migrations/20261117140000_momo_staff_floats.sql in Supabase.";
  }
  return message;
}
