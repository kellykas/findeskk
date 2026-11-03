import { describe, expect, it } from "vitest";
import { buildPeriodReport, numericToMinor, profitAndLossCsv } from "./reports";

const accounts = [
  {
    accountId: "a1",
    code: "1000",
    name: "Cash on hand",
    type: "asset" as const,
    normalBalance: "debit" as const,
  },
  {
    accountId: "a2",
    code: "4000",
    name: "Forex trading income",
    type: "income" as const,
    normalBalance: "credit" as const,
  },
  {
    accountId: "a3",
    code: "5200",
    name: "Utilities",
    type: "expense" as const,
    normalBalance: "debit" as const,
  },
];

describe("numericToMinor", () => {
  it("parses PostgREST numerics without floats", () => {
    expect(numericToMinor("1,250.00".replace(",", ""))).toBe(1_250n);
    expect(numericToMinor("0.00")).toBe(0n);
    expect(numericToMinor("-75.00")).toBe(-75n);
    expect(numericToMinor(42)).toBe(42n);
  });
});

describe("period report", () => {
  const lines = [
    { accountId: "a1", side: "debit" as const, amount: "300000.00" },
    { accountId: "a2", side: "credit" as const, amount: "300000.00" },
    { accountId: "a3", side: "debit" as const, amount: "80000.00" },
    { accountId: "a1", side: "credit" as const, amount: "80000.00" },
  ];

  it("builds a balanced trial balance and income statement", () => {
    const report = buildPeriodReport(accounts, lines);

    expect(report.trial.balanced).toBe(true);
    expect(report.trial.debitTotal.minor).toBe(380_000n);
    expect(report.incomeTotal.minor).toBe(300_000n);
    expect(report.expenseTotal.minor).toBe(80_000n);
    expect(report.netProfit.minor).toBe(220_000n);
    expect(report.postedLines).toBe(4);
  });

  it("returns zeros for a period with no postings", () => {
    const report = buildPeriodReport(accounts, []);
    expect(report.incomeTotal.minor).toBe(0n);
    expect(report.expenseTotal.minor).toBe(0n);
    expect(report.netProfit.minor).toBe(0n);
    expect(report.trial.balanced).toBe(true);
    expect(report.trial.rows).toHaveLength(accounts.length);
  });

  it("reports a loss as a negative net profit", () => {
    const report = buildPeriodReport(accounts, [
      { accountId: "a3", side: "debit", amount: "50000.00" },
      { accountId: "a1", side: "credit", amount: "50000.00" },
    ]);
    expect(report.netProfit.minor).toBe(-50_000n);
  });

  it("exports a CSV statement with the period and totals", () => {
    const csv = profitAndLossCsv(buildPeriodReport(accounts, lines), {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(csv).toContain("2026-10-01 to 2026-10-31");
    expect(csv).toContain("Income,4000 Forex trading income,300000");
    expect(csv).toContain("Expense total,,80000");
    expect(csv).toContain("Net profit,,220000");
  });
});
