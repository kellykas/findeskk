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
import { momoCashMovement, type MomoType } from "./momo";
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

/** A line with the date of its entry, so it can be placed in a month. */
export interface DatedReportLine extends ReportLine {
  date: string;
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

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;

function dayFromIso(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoFromDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * The period of the same length immediately before `range`, so a report can
 * say whether a month beat the month before it rather than only showing a
 * figure with no context.
 */
export function previousPeriod(range: DateRange): DateRange | null {
  const start = dayFromIso(range.from);
  const end = dayFromIso(range.to);
  if (start === null || end === null || end < start) return null;
  const days = Math.round((end - start) / DAY_MS) + 1;
  const previousEnd = start - DAY_MS;
  return {
    from: isoFromDay(previousEnd - (days - 1) * DAY_MS),
    to: isoFromDay(previousEnd),
  };
}

function monthIndexFromIso(value: string): number | null {
  const day = dayFromIso(value);
  if (day === null) return null;
  const date = new Date(day);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/** `YYYY-MM` for a month index counted from January of year 0. */
function monthKey(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

export interface MonthlyPoint {
  /** Month key, `YYYY-MM`. */
  month: string;
  income: Money;
  expenses: Money;
  net: Money;
}

/**
 * Income and expenses per month for every month in `range`, including months
 * with no postings. A reversal (a debit against an income account, or a credit
 * against an expense account) reduces that month rather than being dropped, so
 * the bars always reconcile with the income statement for the same dates.
 */
export function buildMonthlyTrend(
  accounts: readonly ReportAccount[],
  lines: readonly DatedReportLine[],
  range: DateRange,
): MonthlyPoint[] {
  const start = monthIndexFromIso(range.from);
  const end = monthIndexFromIso(range.to);
  if (start === null || end === null || end < start) return [];

  const typeById = new Map(accounts.map((account) => [account.accountId, account.type]));
  const buckets = new Map<string, { income: bigint; expenses: bigint }>();
  for (let index = start; index <= end; index += 1) {
    buckets.set(monthKey(index), { income: 0n, expenses: 0n });
  }

  for (const line of lines) {
    const type = typeById.get(line.accountId);
    if (type !== "income" && type !== "expense") continue;
    const bucket = buckets.get(line.date.slice(0, 7));
    if (!bucket) continue;
    const amount = numericToMinor(line.amount);
    const increase = line.side === (type === "income" ? "credit" : "debit");
    if (type === "income") bucket.income += increase ? amount : -amount;
    else bucket.expenses += increase ? amount : -amount;
  }

  return [...buckets.entries()].map(([month, totals]) => ({
    month,
    income: money(totals.income, BASE_CURRENCY),
    expenses: money(totals.expenses, BASE_CURRENCY),
    net: money(totals.income - totals.expenses, BASE_CURRENCY),
  }));
}

export type ChangeDirection = "up" | "down" | "flat";

export interface PeriodChange {
  /** Preformatted, for example "+12.4%". */
  delta: string;
  direction: ChangeDirection;
}

/**
 * Percentage change against the previous period, in tenths of a percent so the
 * arithmetic stays integer and a big figure cannot lose precision.
 * Returns null when there is no baseline to compare with.
 */
export function changeVsPrevious(current: Money, previous: Money): PeriodChange | null {
  if (previous.minor === 0n) return null;
  if (current.minor === previous.minor) return { delta: "0.0%", direction: "flat" };
  const diff = current.minor - previous.minor;
  // Tenths of a percent, truncated toward zero.
  const tenths = (diff * 1000n) / previous.minor;
  const whole = tenths / 10n;
  const fraction = tenths % 10n;
  const sign = diff > 0n ? "+" : "-";
  const magnitude = whole < 0n ? -whole : whole;
  const fractionPart = fraction < 0n ? -fraction : fraction;
  return {
    delta: `${sign}${magnitude}.${fractionPart}%`,
    direction: diff > 0n ? "up" : "down",
  };
}

/** Minimal shapes the runs read, so the services stay free to add fields. */
export interface PerformanceBranch {
  id: string;
  code: string;
  name: string;
}

export interface PerformanceStaff {
  id: string;
  displayName: string;
}

export interface PerformanceTrade {
  branchId: string;
  ugxAmount: Money;
  createdBy: string | null;
}

export interface PerformanceMomo {
  branchId: string;
  type: MomoType;
  amount: Money;
  commission: Money;
  createdBy: string | null;
}

export interface PerformanceAmount {
  branchId: string;
  amount: Money;
  createdBy: string | null;
}

export interface BranchPerformance {
  branchId: string;
  label: string;
  forexCount: number;
  forexTurnover: Money;
  momoCount: number;
  momoVolume: Money;
  incomeCount: number;
  incomeTotal: Money;
  expenseCount: number;
  expenseTotal: Money;
  activityCount: number;
}

export interface TellerPerformance {
  userId: string;
  name: string;
  count: number;
  value: Money;
}

export interface PerformanceSources {
  branches: readonly PerformanceBranch[];
  staff: readonly PerformanceStaff[];
  trades: readonly PerformanceTrade[];
  momo: readonly PerformanceMomo[];
  expenses: readonly PerformanceAmount[];
  income: readonly PerformanceAmount[];
}

function emptyBranch(branchId: string, label: string): BranchPerformance {
  return {
    branchId,
    label,
    forexCount: 0,
    forexTurnover: money(0n, BASE_CURRENCY),
    momoCount: 0,
    momoVolume: money(0n, BASE_CURRENCY),
    incomeCount: 0,
    incomeTotal: money(0n, BASE_CURRENCY),
    expenseCount: 0,
    expenseTotal: money(0n, BASE_CURRENCY),
    activityCount: 0,
  };
}

/**
 * Activity per branch for the period: forex turnover, mobile money cash moved,
 * other income and expenses. Branches with no activity are dropped, and a
 * branch that is no longer listed still appears under its id rather than losing
 * its figures.
 */
export function buildBranchPerformance(sources: PerformanceSources): BranchPerformance[] {
  const byBranch = new Map<string, BranchPerformance>();
  for (const branch of sources.branches) {
    byBranch.set(branch.id, emptyBranch(branch.id, `${branch.code} · ${branch.name}`));
  }
  const entryFor = (branchId: string) => {
    const existing = byBranch.get(branchId);
    if (existing) return existing;
    const created = emptyBranch(branchId, branchId);
    byBranch.set(branchId, created);
    return created;
  };

  for (const trade of sources.trades) {
    const entry = entryFor(trade.branchId);
    entry.forexCount += 1;
    entry.forexTurnover = money(entry.forexTurnover.minor + trade.ugxAmount.minor, BASE_CURRENCY);
  }
  for (const row of sources.momo) {
    const entry = entryFor(row.branchId);
    entry.momoCount += 1;
    entry.momoVolume = money(
      entry.momoVolume.minor + momoCashMovement(row.type, row.amount, row.commission).minor,
      BASE_CURRENCY,
    );
  }
  for (const row of sources.income) {
    const entry = entryFor(row.branchId);
    entry.incomeCount += 1;
    entry.incomeTotal = money(entry.incomeTotal.minor + row.amount.minor, BASE_CURRENCY);
  }
  for (const row of sources.expenses) {
    const entry = entryFor(row.branchId);
    entry.expenseCount += 1;
    entry.expenseTotal = money(entry.expenseTotal.minor + row.amount.minor, BASE_CURRENCY);
  }

  return [...byBranch.values()]
    .map((entry) => ({
      ...entry,
      activityCount: entry.forexCount + entry.momoCount + entry.incomeCount + entry.expenseCount,
    }))
    .filter((entry) => entry.activityCount > 0)
    .sort((a, b) => {
      const left = a.forexTurnover.minor + a.momoVolume.minor;
      const right = b.forexTurnover.minor + b.momoVolume.minor;
      if (left === right) return a.label.localeCompare(b.label);
      return right > left ? 1 : -1;
    });
}

/**
 * Volume handled per member of staff, highest first. Forex and mobile money
 * count at their UGX value, and income and expenses at their amount, so the
 * ranking reflects how much went through each person's hands.
 */
export function buildTellerPerformance(sources: PerformanceSources): TellerPerformance[] {
  const byUser = new Map<string, TellerPerformance>();
  const nameFor = (userId: string) => {
    const staff = sources.staff.find((member) => member.id === userId);
    return staff?.displayName || userId.slice(0, 8);
  };
  const entryFor = (userId: string) => {
    const existing = byUser.get(userId);
    if (existing) return existing;
    const created = { userId, name: nameFor(userId), count: 0, value: money(0n, BASE_CURRENCY) };
    byUser.set(userId, created);
    return created;
  };
  const addValue = (userId: string, minor: bigint) => {
    const entry = entryFor(userId);
    entry.count += 1;
    entry.value = money(entry.value.minor + minor, BASE_CURRENCY);
  };

  for (const trade of sources.trades) {
    if (trade.createdBy) addValue(trade.createdBy, trade.ugxAmount.minor);
  }
  for (const row of sources.momo) {
    if (row.createdBy) {
      addValue(row.createdBy, momoCashMovement(row.type, row.amount, row.commission).minor);
    }
  }
  for (const row of sources.income) {
    if (row.createdBy) addValue(row.createdBy, row.amount.minor);
  }
  for (const row of sources.expenses) {
    if (row.createdBy) addValue(row.createdBy, row.amount.minor);
  }

  return [...byUser.values()].sort((a, b) => {
    if (a.value.minor === b.value.minor) return a.name.localeCompare(b.name);
    return b.value.minor > a.value.minor ? 1 : -1;
  });
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

/** Trial balance for a spreadsheet, with the period and the balance check. */
export function trialBalanceCsv(report: PeriodReport, range: DateRange): string {
  const lines: string[][] = [
    ["FinDesk trial balance", `${range.from} to ${range.to}`, ""],
    ["Code", "Account", "Type", "Debits", "Credits"],
    ...report.trial.rows
      .filter((row) => row.debit.minor !== 0n || row.credit.minor !== 0n)
      .map((row) => [
        row.code,
        row.name,
        row.type,
        toDecimalString(row.debit),
        toDecimalString(row.credit),
      ]),
    [
      "Total",
      "",
      "",
      toDecimalString(report.trial.debitTotal),
      toDecimalString(report.trial.creditTotal),
    ],
    [report.trial.balanced ? "Balanced" : "Out of balance", "", "", "", ""],
  ];
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\n");
}

/** Branch and teller activity for a spreadsheet, in the order the screen shows. */
export function performanceCsv(
  branches: readonly BranchPerformance[],
  tellers: readonly TellerPerformance[],
  range: DateRange,
): string {
  const lines: string[][] = [
    ["FinDesk branch and teller performance", `${range.from} to ${range.to}`, ""],
    ["Branch", "Forex trades", "Forex UGX", "Mobile money", "Cash moved", "Income", "Expenses"],
    ...branches.map((row) => [
      row.label,
      String(row.forexCount),
      toDecimalString(row.forexTurnover),
      String(row.momoCount),
      toDecimalString(row.momoVolume),
      toDecimalString(row.incomeTotal),
      toDecimalString(row.expenseTotal),
    ]),
    ["", "", "", "", "", "", ""],
    ["Teller", "Transactions", "Value", "", "", "", ""],
    ...tellers.map((row) => [
      row.name,
      String(row.count),
      toDecimalString(row.value),
      "",
      "",
      "",
      "",
    ]),
  ];
  return lines.map((cells) => cells.map(csvCell).join(",")).join("\n");
}
