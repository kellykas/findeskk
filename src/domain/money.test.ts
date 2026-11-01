import { describe, expect, it } from "vitest";
import { add, formatMoney, money, parseMoney, subtract } from "./money";

describe("money", () => {
  it("parses USD with cents without floating point", () => {
    expect(parseMoney("1,250.50", "USD").minor).toBe(125050n);
  });
  it("rejects decimals for UGX", () => {
    expect(() => parseMoney("100.5", "UGX")).toThrow();
  });
  it("adds 0.1 + 0.2 exactly", () => {
    expect(add(parseMoney("0.1", "USD"), parseMoney("0.2", "USD")).minor).toBe(30n);
  });
  it("refuses to mix currencies", () => {
    expect(() => subtract(money(1n, "USD"), money(1n, "EUR"))).toThrow();
  });
  it("formats UGX and USD", () => {
    expect(formatMoney(money(48750000n, "UGX"))).toBe("UGX 48,750,000");
    expect(formatMoney(money(-5n, "USD"))).toBe("-USD 0.05");
  });
});
