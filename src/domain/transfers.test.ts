import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  TRANSFER_CURRENCIES,
  formatTransferAmount,
  isTransferCurrency,
  parseTransferAmount,
  transferErrorMessage,
  transferSchema,
} from "./transfers";

const valid = {
  currency: "USD" as const,
  amount: "1000.00",
  fromBranchId: "branch-hq",
  toBranchId: "branch-kla",
  reference: "",
  notes: "",
  entryDate: "2026-11-02",
};

describe("transfer amounts", () => {
  it("keeps two decimals for foreign currency", () => {
    expect(parseTransferAmount("1250.75", "USD")).toEqual(money(125_075n, "USD"));
    expect(parseTransferAmount("100", "USD")).toEqual(money(10_000n, "USD"));
  });

  it("treats UGX as whole shillings only", () => {
    expect(parseTransferAmount("500000", "UGX")).toEqual(money(500_000n, "UGX"));
    expect(parseTransferAmount("500000.00", "UGX")).toEqual(money(500_000n, "UGX"));
    expect(parseTransferAmount("500000.50", "UGX")).toBeNull();
  });

  it("rejects malformed input instead of rounding it", () => {
    for (const value of ["", "0", "-5", "1.234", "abc", "1,2,3.4.5"]) {
      expect(parseTransferAmount(value, "USD")).toBeNull();
    }
  });

  it("formats an amount with the currency and grouping", () => {
    const usd = {
      id: "1",
      currency: "USD" as const,
      amount: money(1_234_567n, "USD"),
      fromBranchId: "a",
      toBranchId: "b",
      reference: "",
      notes: "",
      entryDate: "2026-11-02",
      createdAt: "2026-11-02T09:00:00Z",
    };
    expect(formatTransferAmount(usd)).toBe("12,345.67 USD");
    expect(formatTransferAmount({ ...usd, currency: "UGX", amount: money(500_000n, "UGX") })).toBe(
      "500,000 UGX",
    );
  });
});

describe("transfer validation", () => {
  it("accepts a well formed transfer", () => {
    expect(transferSchema("USD").safeParse(valid).success).toBe(true);
  });

  it("refuses to transfer to the same branch", () => {
    const result = transferSchema("USD").safeParse({ ...valid, toBranchId: valid.fromBranchId });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/must be different/);
  });

  it("refuses a zero or unparsable amount", () => {
    expect(transferSchema("USD").safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(transferSchema("USD").safeParse({ ...valid, amount: "1.234" }).success).toBe(false);
  });

  it("requires the currency to be supported", () => {
    expect(isTransferCurrency("UGX")).toBe(true);
    expect(isTransferCurrency("USD")).toBe(true);
    expect(isTransferCurrency("CHF")).toBe(false);
    expect(TRANSFER_CURRENCIES).toContain("UGX");
  });
});

describe("transfer errors", () => {
  it("explains the both-branches rule in plain language", () => {
    expect(transferErrorMessage("You are not assigned to both branches in this transfer")).toMatch(
      /assigned to both branches/,
    );
  });

  it("points at the migration when the table is missing", () => {
    expect(transferErrorMessage("Could not find the table 'public.currency_transfers'")).toMatch(
      /apply the currency transfers migration/i,
    );
  });

  it("passes unfamiliar messages through unchanged", () => {
    expect(transferErrorMessage("something unexpected")).toBe("something unexpected");
  });
});
