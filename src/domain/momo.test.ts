import { describe, expect, it } from "vitest";

import { money } from "./money";
import { commissionForPercent, momoCashMovement, momoReversalSchema } from "./momo";

describe("mobile money reversal form", () => {
  it("refuses a reason shorter than four characters", () => {
    expect(momoReversalSchema.safeParse({ reason: "  no  " }).success).toBe(false);
    expect(momoReversalSchema.safeParse({ reason: "" }).success).toBe(false);
  });

  it("accepts a short real reason and trims it", () => {
    const parsed = momoReversalSchema.safeParse({ reason: "  wrong network  " });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.reason).toBe("wrong network");
  });

  it("refuses an over-long reason", () => {
    expect(momoReversalSchema.safeParse({ reason: "x".repeat(301) }).success).toBe(false);
    expect(momoReversalSchema.safeParse({ reason: "x".repeat(300) }).success).toBe(true);
  });
});

describe("cash moved by a transaction", () => {
  const amount = money(100000n, "UGX");
  const commission = money(2000n, "UGX");

  it("adds commission to a deposit, because the customer pays it", () => {
    expect(momoCashMovement("deposit", amount, commission).minor).toBe(102000n);
  });

  it("subtracts commission from a withdrawal, because the agent keeps it", () => {
    expect(momoCashMovement("withdrawal", amount, commission).minor).toBe(98000n);
  });
});

describe("commission taken as a percentage", () => {
  const amount = money(100000n, "UGX");

  it("takes the rate off the amount the customer withdrew", () => {
    expect(commissionForPercent(amount, "3")?.minor).toBe(3000n);
    expect(commissionForPercent(amount, "2.5")?.minor).toBe(2500n);
    expect(commissionForPercent(amount, "0")?.minor).toBe(0n);
  });

  it("leaves the amount handed to the customer after the deduction", () => {
    const fee = commissionForPercent(amount, "3");
    expect(fee && momoCashMovement("withdrawal", amount, fee).minor).toBe(97000n);
  });

  it("rounds to the nearest shilling instead of leaving a fraction", () => {
    expect(commissionForPercent(money(100005n, "UGX"), "2.5")?.minor).toBe(2500n);
    expect(commissionForPercent(money(1n, "UGX"), "3")?.minor).toBe(0n);
    expect(commissionForPercent(money(17n, "UGX"), "3")?.minor).toBe(1n);
  });

  it("refuses a rate it cannot read", () => {
    expect(commissionForPercent(amount, "")).toBeNull();
    expect(commissionForPercent(amount, "abc")).toBeNull();
    expect(commissionForPercent(amount, "-3")).toBeNull();
    expect(commissionForPercent(amount, "3%")).toBeNull();
    expect(commissionForPercent(amount, "101")).toBeNull();
  });
});
