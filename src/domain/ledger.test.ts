import { describe, expect, it } from "vitest";
import { money } from "./money";
import {
  buildTrialBalance,
  expectedNormalBalance,
  parseLedgerAmount,
  signedBalance,
  validateJournalLines,
  type LedgerLineInput,
} from "./ledger";

const ugx = (minor: number | bigint) => money(BigInt(minor), "UGX");

describe("expectedNormalBalance", () => {
  it("assigns debits to assets and expenses only", () => {
    expect(expectedNormalBalance("asset")).toBe("debit");
    expect(expectedNormalBalance("expense")).toBe("debit");
    expect(expectedNormalBalance("liability")).toBe("credit");
    expect(expectedNormalBalance("equity")).toBe("credit");
    expect(expectedNormalBalance("income")).toBe("credit");
  });
});

describe("validateJournalLines", () => {
  const cashDeposit: LedgerLineInput[] = [
    { accountCode: "1000", side: "debit", amount: ugx(500_000) },
    { accountCode: "4000", side: "credit", amount: ugx(500_000) },
  ];

  it("returns matching totals for a balanced entry", () => {
    const totals = validateJournalLines(cashDeposit);
    expect(totals.debit.minor).toBe(500_000n);
    expect(totals.credit.minor).toBe(500_000n);
  });

  it("rejects fewer than two lines", () => {
    expect(() => validateJournalLines([cashDeposit[0]!])).toThrow(/at least two lines/);
  });

  it("rejects an unbalanced entry and shows both totals", () => {
    expect(() =>
      validateJournalLines([
        { accountCode: "1000", side: "debit", amount: ugx(500_000) },
        { accountCode: "4000", side: "credit", amount: ugx(400_000) },
      ]),
    ).toThrow(/not balanced: debits UGX 500,000 vs credits UGX 400,000/);
  });

  it("rejects zero, negative and missing accounts", () => {
    expect(() =>
      validateJournalLines([
        { accountCode: "1000", side: "debit", amount: ugx(0) },
        { accountCode: "4000", side: "credit", amount: ugx(0) },
      ]),
    ).toThrow(/greater than zero/);
    expect(() =>
      validateJournalLines([
        { accountCode: "  ", side: "debit", amount: ugx(10) },
        { accountCode: "4000", side: "credit", amount: ugx(10) },
      ]),
    ).toThrow(/needs an account/);
  });

  it("refuses foreign currency lines", () => {
    expect(() =>
      validateJournalLines([
        { accountCode: "1000", side: "debit", amount: money(100n, "USD") },
        { accountCode: "4000", side: "credit", amount: money(100n, "USD") },
      ]),
    ).toThrow(/must use UGX/);
  });
});

describe("signedBalance", () => {
  it("counts debits positive on debit-normal accounts", () => {
    expect(signedBalance({ normalBalance: "debit", debit: ugx(900), credit: ugx(400) }).minor).toBe(
      500n,
    );
  });

  it("counts credits positive on credit-normal accounts", () => {
    expect(
      signedBalance({ normalBalance: "credit", debit: ugx(400), credit: ugx(900) }).minor,
    ).toBe(500n);
  });

  it("can go negative when the normal side is reversed", () => {
    expect(signedBalance({ normalBalance: "debit", debit: ugx(100), credit: ugx(250) }).minor).toBe(
      -150n,
    );
  });
});

describe("buildTrialBalance", () => {
  it("adds up every account and proves the ledger balances", () => {
    const result = buildTrialBalance([
      {
        code: "1000",
        name: "Cash",
        type: "asset",
        normalBalance: "debit",
        debit: ugx(750_000),
        credit: ugx(0),
      },
      {
        code: "4000",
        name: "Forex income",
        type: "income",
        normalBalance: "credit",
        debit: ugx(0),
        credit: ugx(750_000),
      },
    ]);

    expect(result.balanced).toBe(true);
    expect(result.debitTotal.minor).toBe(750_000n);
    expect(result.rows[0]?.balance.minor).toBe(750_000n);
    expect(result.rows[1]?.balance.minor).toBe(750_000n);
  });

  it("flags an unbalanced ledger", () => {
    const result = buildTrialBalance([
      {
        code: "1000",
        name: "Cash",
        type: "asset",
        normalBalance: "debit",
        debit: ugx(100),
        credit: ugx(0),
      },
    ]);

    expect(result.balanced).toBe(false);
  });
});

describe("parseLedgerAmount", () => {
  it("parses grouped shilling amounts without decimals", () => {
    expect(parseLedgerAmount("1,250,000")?.minor).toBe(1_250_000n);
  });

  it("rejects non-numeric and fractional shillings", () => {
    expect(parseLedgerAmount("")).toBeNull();
    expect(parseLedgerAmount("abc")).toBeNull();
    expect(parseLedgerAmount("10.50")).toBeNull();
  });
});
