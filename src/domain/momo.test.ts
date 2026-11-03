import { describe, expect, it } from "vitest";

import { money } from "./money";
import { momoCashMovement, momoReversalSchema } from "./momo";

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
