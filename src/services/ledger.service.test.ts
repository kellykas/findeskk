import { describe, expect, it } from "vitest";
import { money } from "@/domain/money";
import {
  ledgerErrorMessage,
  mapAccountBalances,
  mapJournalEntries,
  toTrialBalance,
  type AccountBalanceRow,
  type JournalEntryRow,
  type JournalLineRow,
} from "./ledger.service";

const balanceRow = (overrides: Partial<AccountBalanceRow> = {}): AccountBalanceRow => ({
  account_id: "a1",
  code: "1000",
  name: "Cash on hand — UGX",
  type: "asset",
  normal_balance: "debit",
  active: true,
  total_debit: "500000.00",
  total_credit: "0.00",
  balance: "500000.00",
  ...overrides,
});

const entry = (overrides: Partial<JournalEntryRow> = {}): JournalEntryRow => ({
  id: "e1",
  reference: "JV-2026-000001",
  entry_date: "2026-11-02",
  description: "Opening cash",
  entry_type: "manual",
  branch_id: null,
  reverses_entry_id: null,
  created_by: "u1",
  created_at: "2026-11-02T08:00:00Z",
  ...overrides,
});

const line = (overrides: Partial<JournalLineRow> = {}): JournalLineRow => ({
  id: "l1",
  entry_id: "e1",
  account_id: "a1",
  branch_id: null,
  side: "debit",
  amount: "500000.00",
  memo: "",
  ...overrides,
});

describe("mapAccountBalances", () => {
  it("parses numeric strings into minor units", () => {
    const [account] = mapAccountBalances([balanceRow()]);
    expect(account?.debit.minor).toBe(500_000n);
    expect(account?.balance.minor).toBe(500_000n);
    expect(account?.type).toBe("asset");
    expect(account?.normalBalance).toBe("debit");
  });

  it("handles null totals as zero", () => {
    const [account] = mapAccountBalances([
      balanceRow({ total_debit: null, total_credit: null, balance: null }),
    ]);
    expect(account?.debit.minor).toBe(0n);
    expect(account?.balance.minor).toBe(0n);
  });

  it("rejects unknown account types instead of guessing", () => {
    expect(() => mapAccountBalances([balanceRow({ type: "mystery" })])).toThrow(
      /Unknown account type/,
    );
  });
});

describe("toTrialBalance", () => {
  it("proves a balanced ledger from service rows", () => {
    const trial = toTrialBalance(
      mapAccountBalances([
        balanceRow(),
        balanceRow({
          account_id: "a2",
          code: "4000",
          name: "Forex trading income",
          type: "income",
          normal_balance: "credit",
          total_debit: "0.00",
          total_credit: "500000.00",
          balance: "500000.00",
        }),
      ]),
    );

    expect(trial.balanced).toBe(true);
    expect(trial.debitTotal.minor).toBe(500_000n);
    expect(trial.rows.map((row) => row.code)).toEqual(["1000", "4000"]);
  });
});

describe("mapJournalEntries", () => {
  it("groups lines under entries with debits first and totals each side", () => {
    const [mapped] = mapJournalEntries(
      [entry()],
      [
        line({ id: "l2", side: "credit", account_id: "a2" }),
        line({ id: "l1", side: "debit", account_id: "a1" }),
      ],
    );

    expect(mapped?.reference).toBe("JV-2026-000001");
    expect(mapped?.lines.map((l) => l.side)).toEqual(["debit", "credit"]);
    expect(mapped?.debitTotal.minor).toBe(500_000n);
    expect(mapped?.creditTotal.minor).toBe(500_000n);
  });

  it("ignores lines whose entry is not in the page and keeps empty entries visible", () => {
    const mapped = mapJournalEntries(
      [entry()],
      [line({ entry_id: "other" }), line({ id: "l9", side: "unknown" })],
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.lines).toEqual([]);
    expect(mapped[0]?.creditTotal.minor).toBe(0n);
  });

  it("keeps per-line amounts as money", () => {
    const [mapped] = mapJournalEntries([entry()], [line({ amount: "1250000" })]);
    expect(mapped?.lines[0]?.amount).toEqual(money(1_250_000n, "UGX"));
  });
});

describe("ledgerErrorMessage", () => {
  it("turns database errors into operator language", () => {
    expect(ledgerErrorMessage("Forbidden: your roles cannot post journal entries")).toBe(
      "Your roles cannot post journal entries.",
    );
    expect(ledgerErrorMessage("Journal entry is not balanced: debits 10 <> credits 5")).toContain(
      "does not balance",
    );
    expect(ledgerErrorMessage("Posted ledger entries are immutable")).toContain("reversing entry");
    expect(ledgerErrorMessage("Not assigned to this branch")).toContain("not assigned");
  });

  it("passes unknown errors through", () => {
    expect(ledgerErrorMessage("connection reset")).toBe("connection reset");
  });
});
