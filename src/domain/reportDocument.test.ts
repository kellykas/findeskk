import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  buildReportDocument,
  summariseForexOperations,
  summariseMomoOperations,
} from "./reportDocument";
import { buildPeriodReport } from "./reports";

const accounts = [
  {
    accountId: "a1",
    code: "1000",
    name: "Cash on hand",
    type: "asset" as const,
    normalBalance: "debit" as const,
  },
  {
    accountId: "a4",
    code: "1100",
    name: "Bank",
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

const lines = [
  { accountId: "a1", side: "debit" as const, amount: "300000.00" },
  { accountId: "a2", side: "credit" as const, amount: "300000.00" },
  { accountId: "a3", side: "debit" as const, amount: "80000.00" },
  { accountId: "a4", side: "credit" as const, amount: "80000.00" },
];

const priorLines = [
  { accountId: "a1", side: "debit" as const, amount: "250000.00" },
  { accountId: "a2", side: "credit" as const, amount: "250000.00" },
];

function document(overrides: Partial<Parameters<typeof buildReportDocument>[0]> = {}) {
  return buildReportDocument({
    company: {
      name: "Twinz Premium",
      legalName: "Twinz Premium Ltd",
      address: "Kampala Road",
      phone: "+256 700 000000",
      email: "desk@example.com",
      taxNumber: "TIN-1",
    },
    range: { from: "2026-11-01", to: "2026-11-30" },
    locale: "en-GB",
    generatedAt: new Date("2026-11-30T09:15:00Z"),
    preparedBy: "Kelly",
    branchScope: "001 · Kampala",
    report: buildPeriodReport(accounts, lines),
    entries: 2,
    prior: {
      report: buildPeriodReport(accounts, priorLines),
      range: { from: "2026-10-01", to: "2026-10-31" },
    },
    forex: summariseForexOperations([], new Set<string>()),
    momo: summariseMomoOperations([]),
    branchRows: [],
    tellerRows: [],
    trend: [],
    trendFrom: "2025-12-01",
    ...overrides,
  });
}

describe("forex operations", () => {
  const records = [
    {
      id: "t1",
      type: "sell" as const,
      currency: "USD",
      foreignAmount: money(10_000n, "USD"),
      ugxAmount: money(400_000n, "UGX"),
      margin: money(20_000n, "UGX"),
    },
    {
      id: "t2",
      type: "buy" as const,
      currency: "USD",
      foreignAmount: money(5_000n, "USD"),
      ugxAmount: money(210_000n, "UGX"),
      margin: money(0n, "UGX"),
    },
  ];

  it("groups each currency and direction and counts a trade once", () => {
    const summary = summariseForexOperations(records, new Set());
    expect(summary.rows).toHaveLength(2);
    expect(summary.trades).toBe(2);
    expect(summary.turnover.minor).toBe(610_000n);
    expect(summary.margin.minor).toBe(20_000n);
    expect(summary.rows[1]).toMatchObject({ type: "sell", count: 1 });
    expect(summary.excluded).toBe(0);
  });

  it("leaves out a trade replaced by a correction, so the margin is not doubled", () => {
    const summary = summariseForexOperations(records, new Set(["t1"]));
    expect(summary.trades).toBe(1);
    expect(summary.turnover.minor).toBe(210_000n);
    expect(summary.margin.minor).toBe(0n);
    expect(summary.rows.every((row) => row.type !== "sell")).toBe(true);
    expect(summary.excluded).toBe(1);
  });

  it("adds foreign amounts in their own currency without mixing them", () => {
    const summary = summariseForexOperations(
      [
        ...records,
        {
          id: "t3",
          type: "buy" as const,
          currency: "USD",
          foreignAmount: money(2_500n, "USD"),
          ugxAmount: money(105_000n, "UGX"),
          margin: money(0n, "UGX"),
        },
      ],
      new Set(),
    );
    const usdBuy = summary.rows.find((row) => row.currency === "USD" && row.type === "buy");
    expect(usdBuy?.count).toBe(2);
    expect(usdBuy?.foreignAmount.minor).toBe(7_500n);
  });
});

describe("mobile money operations", () => {
  it("counts standing transactions and leaves reversed ones out", () => {
    const summary = summariseMomoOperations([
      {
        network: "mtn",
        type: "deposit",
        amount: money(10_000n, "UGX"),
        commission: money(500n, "UGX"),
        reversed: false,
      },
      {
        network: "mtn",
        type: "withdrawal",
        amount: money(4_000n, "UGX"),
        commission: money(200n, "UGX"),
        reversed: false,
      },
      {
        network: "airtel",
        type: "deposit",
        amount: money(9_000n, "UGX"),
        commission: money(100n, "UGX"),
        reversed: true,
      },
    ]);

    expect(summary.transactions).toBe(2);
    expect(summary.excluded).toBe(1);
    expect(summary.amount.minor).toBe(14_000n);
    expect(summary.commission.minor).toBe(700n);
    // A deposit banks amount plus commission; a withdrawal pays amount less it.
    expect(summary.cash.minor).toBe(10_500n + 3_800n);
    expect(summary.rows.map((row) => row.type)).toEqual(["deposit", "withdrawal"]);
  });
});

describe("report document", () => {
  it("states the period, the currency and who produced the copy", () => {
    const doc = document();
    expect(doc.subtitle).toBe("1 November 2026 to 30 November 2026");
    const identity = new Map(doc.identity.map((entry) => [entry.label, entry.value]));
    expect(identity.get("Days in period")).toBe("30");
    expect(identity.get("Base currency")).toBe("UGX");
    expect(identity.get("Prepared by")).toBe("Kelly");
    expect(identity.get("Journal entries")).toBe("2");
    expect(doc.fileName).toBe("findesk-financial-report-2026-11-01-to-2026-11-30");
  });

  it("builds a profit and loss that compares with the previous period", () => {
    const doc = document();
    const statement = doc.sections.find((section) => section.id === "profit-and-loss");
    const labels = statement?.rows.map((row) => row.cells[0]?.text);
    expect(labels).toContain("Total income");
    expect(labels).toContain("Net profit");

    const netProfit = statement?.rows.find((row) => row.cells[0]?.text === "Net profit");
    expect(netProfit?.cells[2]?.text).toBe("220,000");
    expect(netProfit?.cells[3]?.text).toBe("250,000");
    expect(netProfit?.cells[4]?.text).toBe("-12.0%");
  });

  it("keeps the trial balance to accounts that moved and shows the totals", () => {
    const doc = document();
    const trial = doc.sections.find((section) => section.id === "trial-balance");
    // Two asset accounts moved; the income and expense accounts moved as well.
    expect(trial?.rows).toHaveLength(5);
    const total = trial?.rows[trial.rows.length - 1];
    expect(total?.strong).toBe(true);
    expect(total?.cells[3]?.text).toBe("380,000");
    expect(total?.cells[4]?.text).toBe("380,000");

    // A credit balance is shown as a credit, whatever the account's normal side.
    const income = trial?.rows.find((row) => row.cells[0]?.text === "4000");
    expect(income?.cells[5]?.text).toBe("300,000");
    expect(income?.cells[6]?.text).toBe("Cr");
    const cash = trial?.rows.find((row) => row.cells[0]?.text === "1000");
    expect(cash?.cells[6]?.text).toBe("Dr");
  });

  it("reports cash and bank movement separately from income", () => {
    const doc = document();
    const cash = doc.sections.find((section) => section.id === "cash");
    expect(cash?.rows.map((row) => row.cells[0]?.text)).toEqual(["1000", "1100"]);
    expect(cash?.rows[0]?.cells[4]?.text).toBe("300,000");
    expect(cash?.rows[1]?.cells[4]?.text).toBe("-80,000");
  });

  it("passes the arithmetic checks and says what was left out", () => {
    const doc = document({
      forex: summariseForexOperations(
        [
          {
            id: "t1",
            type: "sell",
            currency: "USD",
            foreignAmount: money(1_000n, "USD"),
            ugxAmount: money(400_000n, "UGX"),
            margin: money(20_000n, "UGX"),
          },
        ],
        new Set(["t1"]),
      ),
      momo: summariseMomoOperations([
        {
          network: "mtn",
          type: "deposit",
          amount: money(1_000n, "UGX"),
          commission: money(100n, "UGX"),
          reversed: true,
        },
      ]),
    });

    expect(doc.checks.every((check) => check.ok)).toBe(true);
    expect(doc.notes.join(" ")).toContain("1 corrected or deleted forex trade");
    expect(doc.notes.join(" ")).toContain("1 reversed mobile money transaction");
    expect(doc.figures.find((figure) => figure.label === "Forex margin")?.value).toBe("UGX 0");
  });

  it("says so when a section has no activity instead of showing zero lines as data", () => {
    const doc = document();
    const forex = doc.sections.find((section) => section.id === "forex");
    expect(forex?.rows).toHaveLength(0);
    expect(forex?.emptyText).toBe("No forex trade stands in this period.");
  });
});
