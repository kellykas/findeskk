/**
 * Account history math.
 *
 * Pure: the screen supplies every posted line for one account up to the end of
 * the range, including lines before the range starts. Those earlier lines are
 * what let the running balance open in the right place instead of restarting at
 * zero on the first day of the filter.
 */
import { BASE_CURRENCY } from "./currency";
import { signedBalance, type JournalSide, type NormalBalance } from "./ledger";
import { money, type Money } from "./money";

export interface AccountHistoryLine {
  entryId: string;
  reference: string;
  entryDate: string;
  description: string;
  entryType: string;
  createdAt: string;
  side: JournalSide;
  amount: Money;
  memo: string;
}

export interface AccountHistoryRow {
  key: string;
  entryDate: string;
  reference: string;
  description: string;
  side: JournalSide;
  debit: Money;
  credit: Money;
  /** Balance in the account's normal direction after this line. */
  runningBalance: Money;
}

export interface AccountHistory {
  rows: AccountHistoryRow[];
  /** Balance brought forward from before the range. */
  openingBalance: Money;
  closingBalance: Money;
  debitTotal: Money;
  creditTotal: Money;
}

const zero = () => money(0n, BASE_CURRENCY);

/** Oldest first: by entry date, then posting order, then reference for ties. */
function chronological(a: AccountHistoryLine, b: AccountHistoryLine): number {
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.reference !== b.reference) return a.reference < b.reference ? -1 : 1;
  return 0;
}

/**
 * Rows inside [from, to] with a running balance, plus the opening and closing
 * balance for the account. Amounts stay in bigint minor units throughout.
 */
export function buildAccountHistory(input: {
  normalBalance: NormalBalance;
  from: string;
  to: string;
  lines: readonly AccountHistoryLine[];
}): AccountHistory {
  const ordered = [...input.lines].sort(chronological);

  let openingDebit = 0n;
  let openingCredit = 0n;
  let debitTotal = 0n;
  let creditTotal = 0n;
  let running = 0n;
  let opened = false;
  const rows: AccountHistoryRow[] = [];

  const open = () => {
    if (opened) return;
    running = signedBalance({
      normalBalance: input.normalBalance,
      debit: money(openingDebit, BASE_CURRENCY),
      credit: money(openingCredit, BASE_CURRENCY),
    }).minor;
    opened = true;
  };

  for (const line of ordered) {
    const isDebit = line.side === "debit";

    if (line.entryDate < input.from || line.entryDate > input.to) {
      // Only lines before the range exist once the query is bounded by `to`.
      if (line.entryDate < input.from) {
        if (isDebit) openingDebit += line.amount.minor;
        else openingCredit += line.amount.minor;
      }
      continue;
    }

    open();
    if (isDebit) debitTotal += line.amount.minor;
    else creditTotal += line.amount.minor;

    const increases = isDebit === (input.normalBalance === "debit");
    running += increases ? line.amount.minor : -line.amount.minor;

    rows.push({
      key: `${line.entryId}-${line.entryDate}-${line.reference}-${line.side}-${line.amount.minor}`,
      entryDate: line.entryDate,
      reference: line.reference,
      description: line.memo || line.description,
      side: line.side,
      debit: isDebit ? line.amount : zero(),
      credit: isDebit ? zero() : line.amount,
      runningBalance: money(running, BASE_CURRENCY),
    });
  }

  open();

  return {
    rows,
    openingBalance: signedBalance({
      normalBalance: input.normalBalance,
      debit: money(openingDebit, BASE_CURRENCY),
      credit: money(openingCredit, BASE_CURRENCY),
    }),
    closingBalance: money(running, BASE_CURRENCY),
    debitTotal: money(debitTotal, BASE_CURRENCY),
    creditTotal: money(creditTotal, BASE_CURRENCY),
  };
}
