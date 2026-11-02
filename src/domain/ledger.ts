/**
 * Double-entry ledger rules.
 *
 * Pure calculations only: the database re-checks every one of these invariants
 * inside post_journal_entry() before anything is written. These helpers exist so
 * the interface can show totals and reject obvious mistakes before a round trip.
 */
import { BASE_CURRENCY } from "./currency";
import { formatMoney, parseMoney, type Money } from "./money";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type NormalBalance = "debit" | "credit";
export type JournalSide = "debit" | "credit";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/** Assets and expenses increase with debits; everything else increases with credits. */
export function expectedNormalBalance(type: AccountType): NormalBalance {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

export interface LedgerLineInput {
  accountCode: string;
  side: JournalSide;
  amount: Money;
  memo?: string;
}

export interface BalancedTotals {
  debit: Money;
  credit: Money;
}

/**
 * Validates a set of lines and returns the totals. Throws on the mistakes the
 * database would also reject, with messages meant for the person posting.
 */
export function validateJournalLines(lines: LedgerLineInput[]): BalancedTotals {
  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines.");
  }

  let debit = 0n;
  let credit = 0n;

  lines.forEach((line, index) => {
    const position = index + 1;
    if (!line.accountCode.trim()) {
      throw new Error(`Line ${position} needs an account.`);
    }
    if (line.amount.currency !== BASE_CURRENCY) {
      throw new Error(`Line ${position} must use ${BASE_CURRENCY}.`);
    }
    if (line.amount.minor <= 0n) {
      throw new Error(`Line ${position} amount must be greater than zero.`);
    }
    if (line.side === "debit") debit += line.amount.minor;
    else credit += line.amount.minor;
  });

  if (debit !== credit) {
    throw new Error(
      `Entry is not balanced: debits ${formatMoney({ minor: debit, currency: BASE_CURRENCY })} ` +
        `vs credits ${formatMoney({ minor: credit, currency: BASE_CURRENCY })}.`,
    );
  }

  return {
    debit: { minor: debit, currency: BASE_CURRENCY },
    credit: { minor: credit, currency: BASE_CURRENCY },
  };
}

/** Signed balance in the account's normal direction (debit-normal or credit-normal). */
export function signedBalance(input: {
  normalBalance: NormalBalance;
  debit: Money;
  credit: Money;
}): Money {
  const value =
    input.normalBalance === "debit"
      ? input.debit.minor - input.credit.minor
      : input.credit.minor - input.debit.minor;
  return { minor: value, currency: input.debit.currency };
}

export interface TrialBalanceAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  debit: Money;
  credit: Money;
}

export interface TrialBalance {
  rows: (TrialBalanceAccount & { balance: Money })[];
  debitTotal: Money;
  creditTotal: Money;
  balanced: boolean;
}

/**
 * Trial balance: every account's raw debit and credit totals, plus the proof that
 * the ledger as a whole balances. Accounts with no movement are kept so the chart
 * of accounts stays visible.
 */
export function buildTrialBalance(accounts: TrialBalanceAccount[]): TrialBalance {
  let debitTotal = 0n;
  let creditTotal = 0n;

  const rows = accounts.map((account) => {
    debitTotal += account.debit.minor;
    creditTotal += account.credit.minor;
    return {
      ...account,
      balance: signedBalance({
        normalBalance: account.normalBalance,
        debit: account.debit,
        credit: account.credit,
      }),
    };
  });

  return {
    rows,
    debitTotal: { minor: debitTotal, currency: BASE_CURRENCY },
    creditTotal: { minor: creditTotal, currency: BASE_CURRENCY },
    balanced: debitTotal === creditTotal,
  };
}

/** Parse a decimal amount from a form field; returns null when it is not valid money. */
export function parseLedgerAmount(input: string): Money | null {
  const clean = input.trim();
  if (!clean) return null;
  try {
    return parseMoney(clean, BASE_CURRENCY);
  } catch {
    return null;
  }
}
