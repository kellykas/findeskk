/**
 * Deleting a company's operational history.
 *
 * Pure logic only: the phrase the super admin has to type, and a safe reader for
 * the row counts the database returns. The database repeats the phrase check and
 * re-checks the role, because a client can skip anything here.
 */

/** The exact word a super admin types before the wipe is allowed. */
export const RESET_PHRASE = "RESET";

/** Case and surrounding spaces are forgiven; the word itself is not. */
export function resetConfirmationMatches(input: string): boolean {
  return input.trim().toUpperCase() === RESET_PHRASE;
}

export interface ResetSummary {
  journalEntries: number;
  journalLines: number;
  fxTransactions: number;
  momoTransactions: number;
  momoReversals: number;
  expenses: number;
  incomes: number;
  currencyTransfers: number;
  customers: number;
  fxRates: number;
}

const EMPTY: ResetSummary = {
  journalEntries: 0,
  journalLines: 0,
  fxTransactions: 0,
  momoTransactions: 0,
  momoReversals: 0,
  expenses: 0,
  incomes: 0,
  currencyTransfers: 0,
  customers: 0,
  fxRates: 0,
};

function count(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

/** Reads `{ deleted: { ... } }` without trusting its shape. */
export function mapResetSummary(raw: unknown): ResetSummary {
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  const deleted = (raw as { deleted?: unknown }).deleted;
  if (!deleted || typeof deleted !== "object") return { ...EMPTY };
  const source = deleted as Record<string, unknown>;
  return {
    journalEntries: count(source, "journal_entries"),
    journalLines: count(source, "journal_lines"),
    fxTransactions: count(source, "fx_transactions"),
    momoTransactions: count(source, "momo_transactions"),
    momoReversals: count(source, "momo_reversals"),
    expenses: count(source, "expenses"),
    incomes: count(source, "incomes"),
    currencyTransfers: count(source, "currency_transfers"),
    customers: count(source, "customers"),
    fxRates: count(source, "fx_rates"),
  };
}

/** Every row the reset removed, for the confirmation message. */
export function resetSummaryTotal(summary: ResetSummary): number {
  return Object.values(summary).reduce((total, value) => total + value, 0);
}
