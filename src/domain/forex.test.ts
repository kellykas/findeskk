import { describe, expect, it } from "vitest";
import { previewTrade, tradeRateFor, ugxValueOfForeign } from "./forex";

const rate = { buyRate: "4300.000000", sellRate: "4400.000000" };

describe("ugxValueOfForeign", () => {
  it("converts a foreign amount at the rate, to the shilling", () => {
    expect(ugxValueOfForeign("10", "4300.000000")?.minor).toBe(43000n);
  });

  it("rounds half up to the shilling", () => {
    // 0.10 * 4301 = 430.1 rounds down; 0.12 * 4301.5 = 516.18 rounds down too
    expect(ugxValueOfForeign("0.10", "4301")?.minor).toBe(430n);
    expect(ugxValueOfForeign("0.12", "4301.5")?.minor).toBe(516n);
  });

  it("rejects an invalid amount or rate", () => {
    expect(ugxValueOfForeign("abc", "4300")).toBeNull();
    expect(ugxValueOfForeign("10", "0")).toBeNull();
  });
});

describe("tradeRateFor", () => {
  it("prices a buy at the published buy rate", () => {
    expect(tradeRateFor("buy", rate)).toBe("4300.000000");
  });

  it("prices a sell at the published sell rate", () => {
    expect(tradeRateFor("sell", rate)).toBe("4400.000000");
  });

  it("agrees with the rate previewTrade uses for the same side", () => {
    // A buy converts at the buy rate, so it never shows a margin.
    const buy = previewTrade({ type: "buy", foreignAmount: "1000", ...rate });
    expect(buy?.margin.minor).toBe(0n);

    // A sell converts at the sell rate and earns the spread.
    const sell = previewTrade({ type: "sell", foreignAmount: "1000", ...rate });
    expect(sell!.margin.minor > 0n).toBe(true);
  });
});
