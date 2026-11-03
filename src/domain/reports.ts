/**
 * Reporting math.
 *
 * Reports are derived from posted journal lines only, so they can never
 * disagree with the ledger. Everything here is pure: the screen supplies the
 * lines it is allowed to read (RLS already scoped them by branch).
 */
import { BASE_CURRENCY, getCurrency } from "./currency";
import {
  buildTrialBalance,
  signedBalance,
  type AccountType,
  type NormalBalance,
  type TrialBalance,
} from "./ledger";
import { formatMoney, money, toDecimalString, type Money } from "./money";

export interface ReportAccount {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
}

export interface ReportLine {
  accountId: string;
  side: "debit" | "credit";
  amount: string | number;
}

export interface ProfitAndLossRow {
  code: string;
  name: string;
  amount: Money;
}

export interface PeriodReport {
  trial: TrialBalance;
  income: ProfitAndLossRow[];
  expenses: ProfitAndLossRow[];
  incomeTotal: Money;
  expenseTotal: Money;
  netProfit: Money;
  postedLines: number;
}

const zero = () => money(0n, BASE_CURRENCY);

/**
 * PostgreSQL numerics arrive as strings with a fixed scale ("1250.00"). The
 * ledger is kept in the base currency, whose decimals decide how much of that
 * scale is significant (UGX has none).
 */
export function numericToMinor(value: string | number): bigint {
  const { decimals } = getCurrency(BASE_CURRENCY);
  const text = String(value ?? "0").trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const digits = `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`.replace(/\D/g, "");
  const minor = BigInt(digits || "0");
  return negative ? -minor : minor;
}

/**
 * Trial balance, income statement and net profit for the supplied lines.
 * Accounts with no movement are kept so an empty period still lists the chart.
 */
export function buildPeriodReport(
  accounts: readonly ReportAccount[],
  lines: readonly ReportLine[],
): PeriodReport {
  const debits = new Map<string, bigint>();
  const credits = new Map<string, bigint>();

  for (const line of lines) {
    const amount = numericToMinor(line.amount);
    if (amount === 0n) continue;
    const target = line.side === "debit" ? debits : credits;
    target.set(line.accountId, (target.get(line.accountId) ?? 0n) + amount);
  }

  const trial = buildTrialBalance(
    accounts.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      debit: money(debits.get(account.accountId) ?? 0n, BASE_CURRENCY),
      credit: money(credits.get(account.accountId) ?? 0n, BASE_CURRENCY),
    })),
  );

  const income: ProfitAndLossRow[] = [];
  const expenses: ProfitAndLossRow[] = [];
  let incomeTotal = zero();
  let expenseTotal = zero();

  for (const row of trial.rows) {
    const balance = signedBalance({
      normalBalance: row.normalBalance,
      debit: row.debit,
      credit: row.credit,
    });
    if (balance.minor === 0n) continue;
    if (row.type === "income") {
      income.push({ code: row.code, name: row.name, amount: balance });
      incomeTotal = money(incomeTotal.minor + balance.minor, BASE_CURRENCY);
    } else if (row.type === "expense") {
      expenses.push({ code: row.code, name: row.name, amount: balance });
      expenseTotal = money(expenseTotal.minor + balance.minor, BASE_CURRENCY);
    }
  }

  return {
    trial,
    income,
    expenses,
    incomeTotal,
    expenseTotal,
    netProfit: money(incomeTotal.minor - expenseTotal.minor, BASE_CURRENCY),
    postedLines: lines.length,
  };
}

export interface StatementRow {
  code: string;
  name: string;
  amount: string;
}

/** Flat rows for CSV export, with amounts as plain decimals for spreadsheets. */
export function statementRows(report: PeriodReport): StatementRow[] {
  return [
    ...report.income.map((row) => ({
      code: row.code,
      name: row.name,
      amount: toDecimalString(row.amount),
    })),
    ...report.expenses.map((row) => ({
      code: row.code,
      name: row.name,
      amount: toDecimalString(row.amount),
    })),
  ];
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function profitAndLossCsv(
  report: PeriodReport,
  range: { from: string; to: string },
): string {
  const lines: string[][] = [
    ["FinDesk profit and loss", `${range.from} to ${range.to}`, ""],
    ["Section", "Account", "Amount (UGX)"],
    ...report.income.map((row) => [
      "Income",
      `${row.code} ${row.name}`,
      toDecimalString(row.amount),
    ]),
    ["Income total", "", toDecimalString(report.incomeTotal)],
    ...report.expenses.map((row) => [
      "Expense",
      `${row.code} ${row.name}`,
      toDecimalString(row.amount),
    ]),
    ["Expense total", "", toDecimalString(report.expenseTotal)],
    ["Net profit", "", toDecimalString(report.netProfit)],
  ];
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\n");
}

export function formatReportMoney(amount: Money): string {
  return formatMoney(amount);
}
