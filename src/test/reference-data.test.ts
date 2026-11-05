import { describe, expect, it } from "vitest";
import {
  activeCurrencies,
  activeNetworks,
  fxCurrencySchema,
  momoNetworkSchema,
} from "@/domain/referenceData";

describe("mobile money networks", () => {
  it("accepts a new network without a float account, so the database creates one", () => {
    const parsed = momoNetworkSchema.safeParse({
      code: "Mpesa",
      name: "M-Pesa",
      active: true,
      sortOrder: "30",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe("mpesa");
    expect(parsed.success && parsed.data.sortOrder).toBe(30);
    expect(parsed.success && parsed.data.floatAccountCode).toBeUndefined();
  });

  it("keeps the account named when an existing network is moved", () => {
    const parsed = momoNetworkSchema.safeParse({
      code: "mpesa",
      name: "M-Pesa",
      floatAccountCode: " 1130 ",
      active: true,
      sortOrder: 30,
    });

    expect(parsed.success && parsed.data.floatAccountCode).toBe("1130");
  });

  it("rejects a code that would not survive being stored on a transaction", () => {
    const parsed = momoNetworkSchema.safeParse({
      code: "M Pesà!",
      name: "M-Pesa",
      floatAccountCode: "1130",
      active: true,
      sortOrder: "30",
    });

    expect(parsed.success).toBe(false);
  });

  it("omits switched-off networks from a recording form", () => {
    const networks = [
      { code: "airtel", name: "Airtel", floatAccountCode: "1120", active: true, sortOrder: 20 },
      { code: "mtn", name: "MTN", floatAccountCode: "1110", active: false, sortOrder: 10 },
    ];

    expect(activeNetworks(networks).map((network) => network.code)).toEqual(["airtel"]);
  });
});

describe("forex currencies", () => {
  it("accepts any three letter code the company starts trading", () => {
    const parsed = fxCurrencySchema.safeParse({
      code: "aed",
      name: "UAE Dirham",
      active: true,
      sortOrder: "50",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.code).toBe("AED");
  });

  it("refuses the base currency and malformed codes", () => {
    const base = fxCurrencySchema.safeParse({
      code: "UGX",
      name: "Shilling",
      active: true,
      sortOrder: 1,
    });
    const short = fxCurrencySchema.safeParse({
      code: "US",
      name: "Dollar",
      active: true,
      sortOrder: 1,
    });

    expect(base.success).toBe(false);
    expect(short.success).toBe(false);
  });

  it("orders active currencies by the company's sort order", () => {
    const currencies = [
      { code: "GBP", name: "Pound", active: true, sortOrder: 30 },
      { code: "AED", name: "Dirham", active: true, sortOrder: 10 },
      { code: "KES", name: "Shilling", active: false, sortOrder: 5 },
    ];

    expect(activeCurrencies(currencies).map((currency) => currency.code)).toEqual(["AED", "GBP"]);
  });
});
