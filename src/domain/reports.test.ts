import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  buildBranchPerformance,
  buildMonthlyTrend,
  buildPeriodReport,
  buildTellerPerformance,
  changeVsPrevious,
  numericToMinor,
  previousPeriod,
  profitAndLossCsv,
  trialBalanceCsv,
} from "./reports";

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

  it("exports a trial balance with the totals and the balance check", () => {
    const csv = trialBalanceCsv(buildPeriodReport(accounts, lines), {
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(csv).toContain("Cash on hand");
    expect(csv).toContain("Total,,,380000,380000");
    expect(csv).toContain("Balanced");
  });
});

describe("previous period", () => {
  it("covers the same number of days immediately before the range", () => {
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-08-31",
      to: "2026-09-30",
    });
  });

  it("handles a single day and rejects a backwards range", () => {
    expect(previousPeriod({ from: "2026-11-06", to: "2026-11-06" })).toEqual({
      from: "2026-11-05",
      to: "2026-11-05",
    });
    expect(previousPeriod({ from: "2026-11-06", to: "2026-11-01" })).toBeNull();
  });
});

describe("monthly trend", () => {
  const dated = [
    { accountId: "a2", side: "credit" as const, amount: "300000.00", date: "2026-09-12" },
    { accountId: "a3", side: "debit" as const, amount: "80000.00", date: "2026-09-30" },
    { accountId: "a2", side: "credit" as const, amount: "500000.00", date: "2026-11-02" },
    { accountId: "a3", side: "debit" as const, amount: "120000.00", date: "2026-11-03" },
    // A reversal reduces the month it reverses.
    { accountId: "a2", side: "debit" as const, amount: "20000.00", date: "2026-11-04" },
    // Cash movement is neither income nor an expense.
    { accountId: "a1", side: "debit" as const, amount: "999000.00", date: "2026-11-04" },
  ];

  it("groups income and expenses by month and fills empty months with zero", () => {
    const points = buildMonthlyTrend(accounts, dated, { from: "2026-09-01", to: "2026-11-30" });

    expect(points.map((point) => point.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(points[0]?.income.minor).toBe(300_000n);
    expect(points[0]?.expenses.minor).toBe(80_000n);
    expect(points[1]?.income.minor).toBe(0n);
    expect(points[1]?.net.minor).toBe(0n);
    expect(points[2]?.income.minor).toBe(480_000n);
    expect(points[2]?.expenses.minor).toBe(120_000n);
    expect(points[2]?.net.minor).toBe(360_000n);
  });

  it("crosses a year boundary in order and rejects a backwards range", () => {
    const points = buildMonthlyTrend(accounts, [], { from: "2026-12-15", to: "2027-02-02" });
    expect(points.map((point) => point.month)).toEqual(["2026-12", "2027-01", "2027-02"]);
    expect(buildMonthlyTrend(accounts, [], { from: "2026-12-31", to: "2026-01-01" })).toEqual([]);
  });
});

describe("change against the previous period", () => {
  it("reports a rise and a fall with one decimal", () => {
    expect(changeVsPrevious(money(1124n, "UGX"), money(1000n, "UGX"))).toEqual({
      delta: "+12.4%",
      direction: "up",
    });
    expect(changeVsPrevious(money(800n, "UGX"), money(1000n, "UGX"))).toEqual({
      delta: "-20.0%",
      direction: "down",
    });
  });

  it("has no percentage without a baseline", () => {
    expect(changeVsPrevious(money(500n, "UGX"), money(0n, "UGX"))).toBeNull();
    expect(changeVsPrevious(money(500n, "UGX"), money(500n, "UGX"))).toEqual({
      delta: "0.0%",
      direction: "flat",
    });
  });
});

describe("branch and teller performance", () => {
  const sources = {
    branches: [
      { id: "b1", code: "001", name: "Kampala" },
      { id: "b2", code: "002", name: "Gulu" },
      { id: "b3", code: "003", name: "Idle" },
    ],
    staff: [{ id: "u1", displayName: "Kelly" }],
    trades: [{ branchId: "b1", ugxAmount: money(1000n, "UGX"), createdBy: "u1" }],
    momo: [
      {
        branchId: "b1",
        type: "deposit" as const,
        amount: money(200n, "UGX"),
        commission: money(50n, "UGX"),
        createdBy: "u1",
      },
    ],
    expenses: [{ branchId: "b2", amount: money(300n, "UGX"), createdBy: "u2" }],
    income: [{ branchId: "b2", amount: money(120n, "UGX"), createdBy: null }],
  };

  it("totals each branch and drops branches with no activity", () => {
    const rows = buildBranchPerformance(sources);
    expect(rows.map((row) => row.branchId)).toEqual(["b1", "b2"]);
    expect(rows[0]?.label).toBe("001 · Kampala");
    expect(rows[0]?.forexTurnover.minor).toBe(1000n);
    expect(rows[0]?.momoVolume.minor).toBe(250n);
    expect(rows[0]?.activityCount).toBe(2);
    expect(rows[1]?.expenseTotal.minor).toBe(300n);
    expect(rows[1]?.incomeTotal.minor).toBe(120n);
  });

  it("ranks staff by the value that passed through them", () => {
    const rows = buildTellerPerformance(sources);
    expect(rows.map((row) => row.userId)).toEqual(["u1", "u2"]);
    expect(rows[0]).toMatchObject({ name: "Kelly", count: 2 });
    expect(rows[0]?.value.minor).toBe(1250n);
    expect(rows[1]?.name).toBe("u2");
  });
});
