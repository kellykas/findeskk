import { describe, expect, it } from "vitest";

import { companySettingsSchema } from "./settings";

const base = {
  companyName: "TWINZ PREMIUM FOREX BUREAU LTD",
  legalName: "",
  address: "",
  phone: "",
  email: "",
  taxNumber: "",
  appName: "FinDesk",
  logoUrl: "https://example.com/logo.png",
  themePrimary: "#16a34a",
  receiptFormat: "80mm" as const,
  receiptFooter: "",
  fiscalYearStartMonth: 1,
};

function parses(phone: string) {
  return companySettingsSchema.safeParse({ ...base, phone }).success;
}

describe("companySettingsSchema phone", () => {
  it("accepts several numbers separated by / or a comma", () => {
    expect(parses("+256 757 094429 / +256 751 090")).toBe(true);
    expect(parses("+256 757 094429, +256 751 090")).toBe(true);
    expect(parses("+256 757 094429/+256 751 090")).toBe(true);
  });

  it("still accepts the single-number shapes it always did", () => {
    for (const phone of ["", "+256 757 094429", "(041) 234-567", "+256 757 094429 / "]) {
      expect(parses(phone)).toBe(true);
    }
  });

  it("still rejects letters and other punctuation", () => {
    for (const phone of ["call the office", "+256 757 094429 ext 2", "+256;751", "0757.094429"]) {
      expect(parses(phone)).toBe(false);
    }
  });

  it("allows 60 characters but not 61", () => {
    expect(parses("1".repeat(60))).toBe(true);
    expect(parses("1".repeat(61))).toBe(false);
  });
});
