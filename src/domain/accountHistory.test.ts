import { describe, expect, it } from "vitest";
import { buildAccountHistory, type AccountHistoryLine } from "./accountHistory";
import { money } from "./money";

const line = (overrides: Partial<AccountHistoryLine> = {}): AccountHistoryLine => ({
  entryId: "entry-1",
  reference: "JE-1",
  entryDate: "2026-10-05",
  description: "Entry",
  entryType: "manual",
  createdAt: "2026-10-05T09:00:00Z",
  side: "debit",
  amount: money(100_000n, "UGX"),
  memo: "",
  ...overrides,
});

describe("buildAccountHistory", () => {
  it("carries a balance forward from before the range", () => {
    const history = buildAccountHistory({
      normalBalance: "debit",
      from: "2026-10-01",
      to: "2026-10-31",
      lines: [
        line({ entryDate: "2026-09-20", amount: money(400_000n, "UGX") }),
        line({ entryDate: "2026-10-05", amount: money(100_000n, "UGX") }),
      ],
    });

    expect(history.openingBalance.minor).toBe(400_000n);
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]!.runningBalance.minor).toBe(500_000n);
    expect(history.closingBalance.minor).toBe(500_000n);
  });

  it("subtracts the opposite side for a debit-normal account", () => {
    const history = buildAccountHistory({
      normalBalance: "debit",
      from: "2026-10-01",
      to: "2026-10-31",
      lines: [
        line({ entryDate: "2026-10-01", amount: money(500_000n, "UGX") }),
        line({ entryDate: "2026-10-02", side: "credit", amount: money(200_000n, "UGX") }),
      ],
    });

    expect(history.rows.map((row) => row.runningBalance.minor)).toEqual([500_000n, 300_000n]);
    expect(history.debitTotal.minor).toBe(500_000n);
    expect(history.creditTotal.minor).toBe(200_000n);
    expect(history.closingBalance.minor).toBe(300_000n);
  });

  it("increases a credit-normal account on credits", () => {
    const history = buildAccountHistory({
      normalBalance: "credit",
      from: "2026-10-01",
      to: "2026-10-31",
      lines: [
        line({ entryDate: "2026-10-01", side: "credit", amount: money(90_000n, "UGX") }),
        line({ entryDate: "2026-10-03", amount: money(40_000n, "UGX") }),
      ],
    });

    expect(history.rows.map((row) => row.runningBalance.minor)).toEqual([90_000n, 50_000n]);
  });

  it("keeps only the range in the rows and totals", () => {
    const history = buildAccountHistory({
      normalBalance: "debit",
      from: "2026-10-10",
      to: "2026-10-20",
      lines: [
        line({ entryDate: "2026-10-01", amount: money(10_000n, "UGX") }),
        line({ entryDate: "2026-10-15", amount: money(20_000n, "UGX") }),
        line({ entryDate: "2026-11-02", amount: money(30_000n, "UGX") }),
      ],
    });

    expect(history.rows).toHaveLength(1);
    expect(history.debitTotal.minor).toBe(20_000n);
    expect(history.openingBalance.minor).toBe(10_000n);
    expect(history.closingBalance.minor).toBe(30_000n);
  });

  it("returns an empty history for a range with no movement", () => {
    const history = buildAccountHistory({
      normalBalance: "debit",
      from: "2026-10-01",
      to: "2026-10-31",
      lines: [],
    });

    expect(history.rows).toEqual([]);
    expect(history.openingBalance.minor).toBe(0n);
    expect(history.closingBalance.minor).toBe(0n);
  });
});
