import { describe, expect, it } from "vitest";
import {
  EXPENSE_CATEGORY_ACCOUNTS,
  buildExpenseSummary,
  expenseSchema,
  filterExpenses,
  isExpenseCategory,
  type ExpenseRecord,
} from "./expenses";
import { money } from "./money";

function record(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: crypto.randomUUID(),
    expenseDate: "2026-10-05",
    category: "utilities",
    description: "Electricity",
    amount: money(100_000n, "UGX"),
    paidFrom: "cash",
    branchId: "branch-1",
    reference: "",
    notes: "",
    journalEntryId: null,
    createdBy: null,
    createdAt: "2026-10-05T09:00:00Z",
    ...overrides,
  };
}

describe("expense categories", () => {
  it("maps every category to a seeded expense account", () => {
    for (const code of Object.values(EXPENSE_CATEGORY_ACCOUNTS)) {
      expect(code).toMatch(/^5[0-9]{3}$/);
    }
  });

  it("rejects unknown categories", () => {
    expect(isExpenseCategory("utilities")).toBe(true);
    expect(isExpenseCategory("travel")).toBe(false);
  });
});

describe("expense schema", () => {
  it("accepts a valid expense", () => {
    const parsed = expenseSchema.safeParse({
      expenseDate: "2026-01-02",
      category: "rent",
      description: "January rent",
      amount: "1500000",
      paidFrom: "bank",
      branchId: "branch-1",
      reference: "",
      notes: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects zero, negative and malformed amounts", () => {
    for (const amount of ["0", "-5", "abc", ""]) {
      const parsed = expenseSchema.safeParse({
        expenseDate: "2026-01-02",
        category: "rent",
        description: "January rent",
        amount,
        paidFrom: "bank",
        branchId: "branch-1",
        reference: "",
        notes: "",
      });
      expect(parsed.success).toBe(false);
    }
  });

  it("rejects a short description and a future date", () => {
    const shortDescription = expenseSchema.safeParse({
      expenseDate: "2026-01-02",
      category: "rent",
      description: "abc",
      amount: "10",
      paidFrom: "cash",
      branchId: "branch-1",
      reference: "",
      notes: "",
    });
    expect(shortDescription.success).toBe(false);

    const future = expenseSchema.safeParse({
      expenseDate: "2999-01-02",
      category: "rent",
      description: "Rent paid early",
      amount: "10",
      paidFrom: "cash",
      branchId: "branch-1",
      reference: "",
      notes: "",
    });
    expect(future.success).toBe(false);
  });
});

describe("expense summary", () => {
  it("totals by category and payment source, largest first", () => {
    const summary = buildExpenseSummary([
      record({ category: "utilities", amount: money(80_000n, "UGX") }),
      record({ category: "rent", amount: money(1_200_000n, "UGX"), paidFrom: "bank" }),
      record({ category: "utilities", amount: money(20_000n, "UGX") }),
    ]);

    expect(summary.count).toBe(3);
    expect(summary.total.minor).toBe(1_300_000n);
    expect(summary.average.minor).toBe(433_333n);
    expect(summary.byCategory.map((row) => row.category)).toEqual(["rent", "utilities"]);
    expect(summary.byCategory[1]?.total.minor).toBe(100_000n);
    expect(summary.bySource).toEqual([
      { source: "cash", label: "Cash on hand", total: money(100_000n, "UGX") },
      { source: "bank", label: "Bank account", total: money(1_200_000n, "UGX") },
    ]);
  });

  it("handles an empty register", () => {
    const summary = buildExpenseSummary([]);
    expect(summary.total.minor).toBe(0n);
    expect(summary.average.minor).toBe(0n);
    expect(summary.byCategory).toEqual([]);
  });
});

describe("expense filtering", () => {
  it("keeps only expenses inside the inclusive range", () => {
    const rows = [
      record({ expenseDate: "2026-09-30" }),
      record({ expenseDate: "2026-10-01" }),
      record({ expenseDate: "2026-10-31" }),
      record({ expenseDate: "2026-11-01" }),
    ];
    const filtered = filterExpenses(rows, { from: "2026-10-01", to: "2026-10-31" });
    expect(filtered.map((row) => row.expenseDate)).toEqual(["2026-10-01", "2026-10-31"]);
  });
});
