import { describe, expect, it } from "vitest";
import { buildMonthlyFlow, formatDelta, monthOverMonth } from "./dashboard";
import { money } from "./money";

const accounts = [
  { id: "inc-1", type: "income" as const },
  { id: "exp-1", type: "expense" as const },
  { id: "asset-1", type: "asset" as const },
];

const entries = [
  { id: "e1", entryDate: "2026-09-04" },
  { id: "e2", entryDate: "2026-10-11" },
  { id: "e3", entryDate: "2026-10-28" },
];

describe("buildMonthlyFlow", () => {
  it("splits income and expense into their months", () => {
    const flow = buildMonthlyFlow({
      entries,
      accounts,
      months: ["2026-09", "2026-10"],
      lines: [
        { entryId: "e1", accountId: "inc-1", side: "credit", amount: 500_000n },
        { entryId: "e2", accountId: "inc-1", side: "credit", amount: 800_000n },
        { entryId: "e2", accountId: "exp-1", side: "debit", amount: 200_000n },
        { entryId: "e3", accountId: "exp-1", side: "debit", amount: 100_000n },
      ],
    });

    expect(flow).toHaveLength(2);
    expect(flow[0]!.label).toBe("Sep");
    expect(flow[0]!.income.minor).toBe(500_000n);
    expect(flow[0]!.expense.minor).toBe(0n);
    expect(flow[1]!.income.minor).toBe(800_000n);
    expect(flow[1]!.expense.minor).toBe(300_000n);
  });

  it("ignores asset movements so cash transfers never look like profit", () => {
    const flow = buildMonthlyFlow({
      entries,
      accounts,
      months: ["2026-10"],
      lines: [
        { entryId: "e2", accountId: "asset-1", side: "debit", amount: 900_000n },
        { entryId: "e2", accountId: "exp-1", side: "credit", amount: 900_000n },
      ],
    });

    expect(flow[0]!.income.minor).toBe(0n);
    expect(flow[0]!.expense.minor).toBe(-900_000n);
  });

  it("fills months with no postings with zeros", () => {
    const flow = buildMonthlyFlow({
      entries,
      accounts,
      months: ["2026-08", "2026-09"],
      lines: [{ entryId: "e1", accountId: "inc-1", side: "credit", amount: 10_000n }],
    });

    expect(flow[0]!.income.minor).toBe(0n);
    expect(flow[1]!.income.minor).toBe(10_000n);
  });
});

describe("monthOverMonth", () => {
  it("reports the percentage change", () => {
    expect(monthOverMonth(money(1_100n, "UGX"), money(1_000n, "UGX"))).toBe(10);
    expect(monthOverMonth(money(900n, "UGX"), money(1_000n, "UGX"))).toBe(-10);
  });

  it("returns null when there is no previous figure", () => {
    expect(monthOverMonth(money(500n, "UGX"), money(0n, "UGX"))).toBeNull();
  });
});

describe("formatDelta", () => {
  it("signs and rounds the change", () => {
    expect(formatDelta(12.14)).toBe("+12.1%");
    expect(formatDelta(-4)).toBe("-4.0%");
    expect(formatDelta(null)).toBeUndefined();
  });
});
