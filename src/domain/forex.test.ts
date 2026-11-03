import { describe, expect, it } from "vitest";
import { previewTrade, tradeRateFor } from "./forex";

const rate = { buyRate: "4300.000000", sellRate: "4400.000000" };

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
