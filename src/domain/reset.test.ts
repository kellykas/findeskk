import { describe, expect, it } from "vitest";

import {
  RESET_PHRASE,
  mapResetSummary,
  resetConfirmationMatches,
  resetSummaryTotal,
} from "./reset";

describe("resetConfirmationMatches", () => {
  it("accepts the exact phrase regardless of case and padding", () => {
    expect(resetConfirmationMatches(RESET_PHRASE)).toBe(true);
    expect(resetConfirmationMatches("reset")).toBe(true);
    expect(resetConfirmationMatches("  Reset  ")).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    expect(resetConfirmationMatches("")).toBe(false);
    expect(resetConfirmationMatches("RESET ALL")).toBe(false);
    expect(resetConfirmationMatches("RESE")).toBe(false);
    expect(resetConfirmationMatches("delete")).toBe(false);
  });
});

describe("mapResetSummary", () => {
  it("reads the counts the database returns", () => {
    const summary = mapResetSummary({
      deleted: { journal_entries: 12, journal_lines: 26, customers: 3, fx_rates: 5 },
    });
    expect(summary.journalEntries).toBe(12);
    expect(summary.journalLines).toBe(26);
    expect(summary.customers).toBe(3);
    expect(summary.fxRates).toBe(5);
    expect(summary.expenses).toBe(0);
    expect(resetSummaryTotal(summary)).toBe(46);
  });

  it("survives a missing or malformed payload", () => {
    for (const raw of [null, undefined, 42, "nope", {}, { deleted: null }, { deleted: [] }]) {
      const summary = mapResetSummary(raw);
      expect(resetSummaryTotal(summary)).toBe(0);
    }
  });

  it("ignores values that are not counts", () => {
    const summary = mapResetSummary({
      deleted: { journal_entries: -5, customers: "7", expenses: true, incomes: "many" },
    });
    expect(summary.journalEntries).toBe(0);
    expect(summary.customers).toBe(7);
    expect(summary.expenses).toBe(0);
    expect(summary.incomes).toBe(0);
  });
});
