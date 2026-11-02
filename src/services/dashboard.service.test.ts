import { describe, expect, it } from "vitest";
import { money, type Money } from "@/domain/money";
import type { JournalEntry, LedgerAccountBalance } from "./ledger.service";
import { buildDashboardSnapshot } from "./dashboard.service";

const ugx = (minor: number | bigint): Money => money(BigInt(minor), "UGX");

const account = (overrides: Partial<LedgerAccountBalance>): LedgerAccountBalance => ({
  accountId: "a1",
  code: "1000",
  name: "Cash on hand — UGX",
  type: "asset",
  normalBalance: "debit",
  active: true,
  debit: ugx(0),
  credit: ugx(0),
  balance: ugx(0),
  ...overrides,
});

const entry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "e1",
  reference: "JV-2026-000001",
  entryDate: "2026-11-02",
  description: "Opening cash",
  entryType: "opening",
  branchId: null,
  reversesEntryId: null,
  createdBy: "u1",
  createdAt: "2026-11-02T08:00:00Z",
  debitTotal: ugx(500_000),
  creditTotal: ugx(500_000),
  lines: [],
  ...overrides,
});

const emptyInput = {
  balances: [] as LedgerAccountBalance[],
  entries: [] as JournalEntry[],
  branches: [] as { id: string; name: string }[],
  totalPostings: 0,
};

describe("buildDashboardSnapshot", () => {
  it("reports an empty ledger as empty, with zero totals and no activity", () => {
    const snapshot = buildDashboardSnapshot(emptyInput);

    expect(snapshot.hasData).toBe(false);
    expect(snapshot.totalPostings).toBe(0);
    expect(snapshot.recent).toEqual([]);
    expect(snapshot.branches).toEqual([]);
    expect(snapshot.totals.map((total) => total.amount.minor)).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  it("totals each account type from ledger balances", () => {
    const snapshot = buildDashboardSnapshot({
      ...emptyInput,
      totalPostings: 1,
      balances: [
        account({ balance: ugx(500_000), debit: ugx(500_000) }),
        account({
          accountId: "a2",
          code: "3200",
          name: "Opening balance equity",
          type: "equity",
          normalBalance: "credit",
          credit: ugx(500_000),
          balance: ugx(500_000),
        }),
        account({
          accountId: "a3",
          code: "4000",
          name: "Forex trading income",
          type: "income",
          normalBalance: "credit",
          credit: ugx(120_000),
          balance: ugx(120_000),
        }),
      ],
    });

    const byType = new Map(snapshot.totals.map((total) => [total.type, total.amount.minor]));
    expect(byType.get("asset")).toBe(500_000n);
    expect(byType.get("equity")).toBe(500_000n);
    expect(byType.get("income")).toBe(120_000n);
    expect(byType.get("expense")).toBe(0n);
    expect(snapshot.hasData).toBe(true);
  });

  it("keeps cash and float lines in code order with their kinds", () => {
    const snapshot = buildDashboardSnapshot({
      ...emptyInput,
      totalPostings: 2,
      balances: [
        account({
          accountId: "f",
          code: "1110",
          name: "MTN float",
          balance: ugx(300),
          credit: ugx(300),
        }),
        account({ code: "1000", balance: ugx(900), debit: ugx(900) }),
        account({ accountId: "b", code: "1100", name: "Bank", balance: ugx(50), debit: ugx(50) }),
        account({
          accountId: "x",
          code: "5000",
          name: "Salaries",
          type: "expense",
          balance: ugx(10),
        }),
      ],
    });

    expect(snapshot.cash.map((line) => line.code)).toEqual(["1000", "1100", "1110"]);
    expect(snapshot.cash.find((line) => line.code === "1110")?.kind).toBe("electronic_float");
  });

  it("only lists accounts with movement and groups recent postings by branch", () => {
    const snapshot = buildDashboardSnapshot({
      ...emptyInput,
      totalPostings: 3,
      branches: [
        { id: "b1", name: "Kampala Road" },
        { id: "b2", name: "Ntinda" },
      ],
      entries: [
        entry({ id: "e1", branchId: "b1", debitTotal: ugx(100) }),
        entry({ id: "e2", branchId: "b1", debitTotal: ugx(200) }),
        entry({ id: "e3", branchId: null, debitTotal: ugx(50) }),
      ],
      balances: [account({ debit: ugx(100), balance: ugx(100) })],
    });

    expect(snapshot.balances).toHaveLength(1);
    expect(snapshot.branches).toEqual([
      { branch: "Kampala Road", postings: 2, value: ugx(300) },
      { branch: "Head office", postings: 1, value: ugx(50) },
    ]);
  });

  it("labels postings against a deleted or unknown branch honestly", () => {
    const snapshot = buildDashboardSnapshot({
      ...emptyInput,
      totalPostings: 1,
      entries: [entry({ branchId: "missing" })],
    });

    expect(snapshot.branches[0]?.branch).toBe("Unknown branch");
    expect(snapshot.hasData).toBe(true);
  });
});
