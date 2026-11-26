/**
 * The printable report.
 *
 * One document is built from the figures on screen and rendered twice: the page
 * the browser prints (saved as PDF) and the Excel workbook. Both therefore state
 * exactly the same figures, which is what makes an exported copy trustworthy.
 *
 * Everything here is pure. Money stays in bigint minor units until a cell is
 * written, and each section carries the basis it was built on so the printed
 * page never presents an operational count as a ledger figure.
 */
import { BASE_CURRENCY, getCurrency } from "./currency";
import { FX_TYPE_LABELS, type FxType } from "./forex";
import { ACCOUNT_TYPE_LABELS } from "./ledger";
import { MOMO_TYPE_LABELS, momoCashMovement, momoNetworkLabel, type MomoType } from "./momo";
import { formatMoney, money, type Money } from "./money";
import {
  changeVsPrevious,
  type BranchPerformance,
  type MonthlyPoint,
  type PeriodReport,
  type ProfitAndLossRow,
  type TellerPerformance,
} from "./reports";

/** Currency every ledger figure is held in. */
export const REPORT_CURRENCY = BASE_CURRENCY;

/**
 * A cell carries display text and, where it is a number, the value a
 * spreadsheet should receive. Keeping both means the printed page and the
 * workbook never have to re-derive a figure.
 */
export interface DocCell {
  text: string;
  /** Numeric value in major units, for the workbook. */
  value?: number | undefined;
  /** Decimal places an amount is written with. */
  decimals?: number | undefined;
  /** How a spreadsheet should present the number. */
  format?: "money" | "count" | undefined;
}

export interface DocColumn {
  label: string;
  align: "left" | "right";
  /** Excel column width, in characters. */
  width: number;
}

export interface DocRow {
  cells: DocCell[];
  /** Totals and group headings are set apart from ordinary lines. */
  strong?: boolean | undefined;
}

export interface DocSection {
  id: string;
  title: string;
  /** What the section is built from, printed under its heading. */
  basis: string;
  columns: DocColumn[];
  rows: DocRow[];
  emptyText?: string | undefined;
  notes?: string[] | undefined;
}

export interface DocCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface DocFigure {
  label: string;
  value: string;
  note?: string;
}

export interface DocCompany {
  name: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
}

export interface DocIdentity {
  label: string;
  value: string;
}

export interface ReportDocument {
  company: DocCompany;
  title: string;
  subtitle: string;
  /** The period, currency, scope and who produced the copy. */
  identity: DocIdentity[];
  figures: DocFigure[];
  sections: DocSection[];
  checks: DocCheck[];
  notes: string[];
  fileName: string;
}

export interface DateRange {
  from: string;
  to: string;
}

/** A posted trade, reduced to what the operations section needs. */
export interface ForexOpRecord {
  id: string;
  type: FxType;
  currency: string;
  foreignAmount: Money;
  ugxAmount: Money;
  margin: Money;
}

export interface ForexOpRow {
  currency: string;
  type: FxType;
  count: number;
  foreignAmount: Money;
  ugxAmount: Money;
  margin: Money;
}

export interface ForexOpsSummary {
  rows: ForexOpRow[];
  trades: number;
  turnover: Money;
  margin: Money;
  /** Trades corrected or deleted; they are not counted again. */
  excluded: number;
}

export interface MomoOpRecord {
  network: string;
  type: MomoType;
  amount: Money;
  commission: Money;
  /** True once the transaction has been reversed. */
  reversed: boolean;
}

export interface MomoOpRow {
  network: string;
  type: MomoType;
  count: number;
  amount: Money;
  commission: Money;
  cash: Money;
}

export interface MomoOpsSummary {
  rows: MomoOpRow[];
  transactions: number;
  amount: Money;
  commission: Money;
  cash: Money;
  /** Transactions reversed in or before the period; they are not counted. */
  excluded: number;
}

export interface ReportDocumentInput {
  company: DocCompany;
  range: DateRange;
  locale: string;
  generatedAt: Date;
  preparedBy: string;
  /** The branches this viewer's rows are limited to, as printed. */
  branchScope: string;
  report: PeriodReport;
  entries: number;
  prior: { report: PeriodReport; range: DateRange } | null;
  /** Computed from the records, so the screen and the page agree on them. */
  forex: ForexOpsSummary;
  momo: MomoOpsSummary;
  branchRows: readonly BranchPerformance[];
  tellerRows: readonly TellerPerformance[];
  trend: readonly MonthlyPoint[];
  trendFrom: string;
}

const ugx = () => money(0n, BASE_CURRENCY);

function majorUnits(amount: Money): number {
  const { decimals } = getCurrency(amount.currency);
  return Number(amount.minor) / 10 ** decimals;
}

function amountCell(amount: Money): DocCell {
  return {
    text: formatMoney(amount, { showCode: false }),
    value: majorUnits(amount),
    decimals: getCurrency(amount.currency).decimals,
    format: "money",
  };
}

function countCell(value: number): DocCell {
  return { text: String(value), value, decimals: 0, format: "count" };
}

function textCell(value: string): DocCell {
  return { text: value };
}

const emptyCell = (): DocCell => ({ text: "" });

function longDate(iso: string, locale: string): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function dayCount(range: DateRange): number | null {
  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.round((to - from) / 86_400_000) + 1;
}

function timestamp(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(at);
}

/**
 * Forex turnover and margin, counting each trade once.
 *
 * A corrected trade leaves its original row in place (the ledger reverses it)
 * and adds a replacement, so the list contains both. Counting both would
 * double the turnover and the margin of every correction.
 */
export function summariseForexOperations(
  records: readonly ForexOpRecord[],
  supersededIds: ReadonlySet<string>,
): ForexOpsSummary {
  const groups = new Map<string, ForexOpRow>();
  let trades = 0;
  let turnover = ugx();
  let margin = ugx();
  let excluded = 0;

  for (const record of records) {
    if (supersededIds.has(record.id)) {
      excluded += 1;
      continue;
    }
    const key = `${record.currency}|${record.type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.foreignAmount = money(
        existing.foreignAmount.minor + record.foreignAmount.minor,
        existing.foreignAmount.currency,
      );
      existing.ugxAmount = money(existing.ugxAmount.minor + record.ugxAmount.minor, BASE_CURRENCY);
      existing.margin = money(existing.margin.minor + record.margin.minor, BASE_CURRENCY);
    } else {
      groups.set(key, {
        currency: record.currency,
        type: record.type,
        count: 1,
        foreignAmount: record.foreignAmount,
        ugxAmount: record.ugxAmount,
        margin: record.margin,
      });
    }
    trades += 1;
    turnover = money(turnover.minor + record.ugxAmount.minor, BASE_CURRENCY);
    margin = money(margin.minor + record.margin.minor, BASE_CURRENCY);
  }

  const rows = [...groups.values()].sort(
    (a, b) => a.currency.localeCompare(b.currency) || a.type.localeCompare(b.type),
  );
  return { rows, trades, turnover, margin, excluded };
}

/**
 * Mobile money handled per network and direction. A reversed transaction is
 * excluded: its reversal entry already removed it from the ledger, and the
 * replacement (if any) is a transaction of its own.
 */
export function summariseMomoOperations(records: readonly MomoOpRecord[]): MomoOpsSummary {
  const groups = new Map<string, MomoOpRow>();
  let transactions = 0;
  let amount = ugx();
  let commission = ugx();
  let cash = ugx();
  let excluded = 0;

  for (const record of records) {
    if (record.reversed) {
      excluded += 1;
      continue;
    }
    const key = `${record.network}|${record.type}`;
    const movement = momoCashMovement(record.type, record.amount, record.commission);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.amount = money(existing.amount.minor + record.amount.minor, BASE_CURRENCY);
      existing.commission = money(
        existing.commission.minor + record.commission.minor,
        BASE_CURRENCY,
      );
      existing.cash = money(existing.cash.minor + movement.minor, BASE_CURRENCY);
    } else {
      groups.set(key, {
        network: record.network,
        type: record.type,
        count: 1,
        amount: record.amount,
        commission: record.commission,
        cash: movement,
      });
    }
    transactions += 1;
    amount = money(amount.minor + record.amount.minor, BASE_CURRENCY);
    commission = money(commission.minor + record.commission.minor, BASE_CURRENCY);
    cash = money(cash.minor + movement.minor, BASE_CURRENCY);
  }

  const rows = [...groups.values()].sort(
    (a, b) =>
      momoNetworkLabel(a.network).localeCompare(momoNetworkLabel(b.network)) ||
      a.type.localeCompare(b.type),
  );
  return { rows, transactions, amount, commission, cash, excluded };
}

/** The account codes whose movement the cash section reports. */
const CASH_ACCOUNT_CODES = ["1000", "1100"];

function profitAndLossSection(
  report: PeriodReport,
  prior: PeriodReport | null,
  basis: string,
): DocSection {
  const columns: DocColumn[] = [
    { label: "Code", align: "left", width: 9 },
    { label: "Account", align: "left", width: 40 },
    { label: "This period", align: "right", width: 16 },
    { label: "Previous period", align: "right", width: 16 },
    { label: "Change", align: "right", width: 10 },
  ];

  if (report.income.length === 0 && report.expenses.length === 0) {
    return {
      id: "profit-and-loss",
      title: "Profit and loss",
      basis,
      columns,
      rows: [],
      emptyText: "No income or expenses were posted in this period.",
    };
  }

  const priorByCode = new Map<string, Money>();
  if (prior) {
    for (const row of [...prior.income, ...prior.expenses]) {
      priorByCode.set(row.code, row.amount);
    }
  }
  const changeCell = (current: Money, before: Money | undefined): DocCell => {
    if (!before) return textCell("—");
    return textCell(changeVsPrevious(current, before)?.delta ?? "—");
  };
  const statementRow = (row: ProfitAndLossRow): DocRow => {
    const before = priorByCode.get(row.code);
    return {
      cells: [
        textCell(row.code),
        textCell(row.name),
        amountCell(row.amount),
        before ? amountCell(before) : textCell("—"),
        changeCell(row.amount, before),
      ],
    };
  };
  const totalRow = (label: string, current: Money, before: Money | undefined): DocRow => ({
    strong: true,
    cells: [
      textCell(label),
      emptyCell(),
      amountCell(current),
      before ? amountCell(before) : textCell("—"),
      changeCell(current, before),
    ],
  });

  const rows: DocRow[] = [
    {
      strong: true,
      cells: [textCell("Income"), emptyCell(), emptyCell(), emptyCell(), emptyCell()],
    },
    ...report.income.map(statementRow),
    totalRow("Total income", report.incomeTotal, prior?.incomeTotal),
    {
      strong: true,
      cells: [textCell("Expenses"), emptyCell(), emptyCell(), emptyCell(), emptyCell()],
    },
    ...report.expenses.map(statementRow),
    totalRow("Total expenses", report.expenseTotal, prior?.expenseTotal),
    totalRow("Net profit", report.netProfit, prior?.netProfit),
  ];

  return { id: "profit-and-loss", title: "Profit and loss", basis, columns, rows };
}

function trialBalanceSection(report: PeriodReport, basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Code", align: "left", width: 9 },
    { label: "Account", align: "left", width: 34 },
    { label: "Type", align: "left", width: 12 },
    { label: "Debits", align: "right", width: 16 },
    { label: "Credits", align: "right", width: 16 },
    { label: "Balance", align: "right", width: 16 },
    { label: "Dr/Cr", align: "left", width: 7 },
  ];

  const moved = report.trial.rows.filter(
    (row) => row.debit.minor !== 0n || row.credit.minor !== 0n,
  );
  if (moved.length === 0) {
    return {
      id: "trial-balance",
      title: "Trial balance",
      basis,
      columns,
      rows: [],
      emptyText: "No account was posted to in this period.",
    };
  }

  const rows: DocRow[] = moved.map((row) => {
    // Debit positive, credit negative: the side a balance falls on is what a
    // trial balance column reads, so it cannot follow the account's normal side.
    const net = row.debit.minor - row.credit.minor;
    const absolute = money(net < 0n ? -net : net, BASE_CURRENCY);
    return {
      cells: [
        textCell(row.code),
        textCell(row.name),
        textCell(ACCOUNT_TYPE_LABELS[row.type]),
        amountCell(row.debit),
        amountCell(row.credit),
        amountCell(absolute),
        textCell(net > 0n ? "Dr" : net < 0n ? "Cr" : "—"),
      ],
    };
  });

  rows.push({
    strong: true,
    cells: [
      textCell("Total"),
      emptyCell(),
      emptyCell(),
      amountCell(report.trial.debitTotal),
      amountCell(report.trial.creditTotal),
      emptyCell(),
      emptyCell(),
    ],
  });

  return { id: "trial-balance", title: "Trial balance", basis, columns, rows };
}

function monthlySection(
  trend: readonly MonthlyPoint[],
  trendFrom: string,
  range: DateRange,
  locale: string,
): DocSection {
  const columns: DocColumn[] = [
    { label: "Month", align: "left", width: 14 },
    { label: "Income", align: "right", width: 16 },
    { label: "Expenses", align: "right", width: 16 },
    { label: "Net", align: "right", width: 16 },
  ];
  const basis = `Posted journal lines, ${longDate(trendFrom, locale)} to ${longDate(range.to, locale)}`;
  if (trend.length === 0) {
    return {
      id: "monthly",
      title: "Income and expenses by month",
      basis,
      columns,
      rows: [],
      emptyText: "No months fall in this window.",
    };
  }

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  let income = ugx();
  let expenses = ugx();
  let net = ugx();
  const rows: DocRow[] = trend.map((point) => {
    income = money(income.minor + point.income.minor, BASE_CURRENCY);
    expenses = money(expenses.minor + point.expenses.minor, BASE_CURRENCY);
    net = money(net.minor + point.net.minor, BASE_CURRENCY);
    const date = new Date(`${point.month}-01T00:00:00Z`);
    return {
      cells: [
        textCell(monthLabel.format(date)),
        amountCell(point.income),
        amountCell(point.expenses),
        amountCell(point.net),
      ],
    };
  });
  rows.push({
    strong: true,
    cells: [textCell("Total"), amountCell(income), amountCell(expenses), amountCell(net)],
  });

  return {
    id: "monthly",
    title: "Income and expenses by month",
    basis,
    columns,
    rows,
  };
}

function forexSection(summary: ForexOpsSummary, basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Currency", align: "left", width: 11 },
    { label: "Direction", align: "left", width: 11 },
    { label: "Trades", align: "right", width: 9 },
    { label: "Foreign amount", align: "right", width: 17 },
    { label: `Value (${BASE_CURRENCY})`, align: "right", width: 17 },
    { label: `Margin (${BASE_CURRENCY})`, align: "right", width: 16 },
  ];

  if (summary.rows.length === 0) {
    return {
      id: "forex",
      title: "Forex operations",
      basis,
      columns,
      rows: [],
      emptyText: "No forex trade stands in this period.",
      notes:
        summary.excluded > 0
          ? [
              `${summary.excluded} corrected or deleted trade${
                summary.excluded === 1 ? "" : "s"
              } excluded.`,
            ]
          : undefined,
    };
  }

  const rows: DocRow[] = summary.rows.map((row) => ({
    cells: [
      textCell(row.currency),
      textCell(FX_TYPE_LABELS[row.type]),
      countCell(row.count),
      amountCell(row.foreignAmount),
      amountCell(row.ugxAmount),
      amountCell(row.margin),
    ],
  }));
  rows.push({
    strong: true,
    cells: [
      textCell("Total"),
      emptyCell(),
      countCell(summary.trades),
      emptyCell(),
      amountCell(summary.turnover),
      amountCell(summary.margin),
    ],
  });

  return {
    id: "forex",
    title: "Forex operations",
    basis,
    columns,
    rows,
    notes:
      summary.excluded > 0
        ? [
            `${summary.excluded} corrected or deleted trade${
              summary.excluded === 1 ? "" : "s"
            } excluded.`,
          ]
        : undefined,
  };
}

function momoSection(summary: MomoOpsSummary, basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Network", align: "left", width: 12 },
    { label: "Direction", align: "left", width: 12 },
    { label: "Transactions", align: "right", width: 13 },
    { label: `Amount (${BASE_CURRENCY})`, align: "right", width: 17 },
    { label: `Commission (${BASE_CURRENCY})`, align: "right", width: 18 },
    { label: `Cash moved (${BASE_CURRENCY})`, align: "right", width: 18 },
  ];

  if (summary.rows.length === 0) {
    return {
      id: "mobile-money",
      title: "Mobile money operations",
      basis,
      columns,
      rows: [],
      emptyText: "No mobile money transaction stands in this period.",
      notes:
        summary.excluded > 0
          ? [
              `${summary.excluded} reversed transaction${summary.excluded === 1 ? "" : "s"} excluded.`,
            ]
          : undefined,
    };
  }

  const rows: DocRow[] = summary.rows.map((row) => ({
    cells: [
      textCell(momoNetworkLabel(row.network)),
      textCell(MOMO_TYPE_LABELS[row.type]),
      countCell(row.count),
      amountCell(row.amount),
      amountCell(row.commission),
      amountCell(row.cash),
    ],
  }));
  rows.push({
    strong: true,
    cells: [
      textCell("Total"),
      emptyCell(),
      countCell(summary.transactions),
      amountCell(summary.amount),
      amountCell(summary.commission),
      amountCell(summary.cash),
    ],
  });

  return {
    id: "mobile-money",
    title: "Mobile money operations",
    basis,
    columns,
    rows,
    notes:
      summary.excluded > 0
        ? [`${summary.excluded} reversed transaction${summary.excluded === 1 ? "" : "s"} excluded.`]
        : undefined,
  };
}

function branchSection(rows: readonly BranchPerformance[], basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Branch", align: "left", width: 30 },
    { label: "Forex trades", align: "right", width: 12 },
    { label: `Forex ${BASE_CURRENCY}`, align: "right", width: 16 },
    { label: "MoMo transactions", align: "right", width: 15 },
    { label: `Cash moved (${BASE_CURRENCY})`, align: "right", width: 18 },
    { label: `Income (${BASE_CURRENCY})`, align: "right", width: 16 },
    { label: `Expenses (${BASE_CURRENCY})`, align: "right", width: 16 },
  ];

  if (rows.length === 0) {
    return {
      id: "branches",
      title: "Branch performance",
      basis,
      columns,
      rows: [],
      emptyText: "No branch recorded activity in this period.",
    };
  }

  let forexCount = 0;
  let momoCount = 0;
  let forexTurnover = ugx();
  let momoVolume = ugx();
  let income = ugx();
  let expenses = ugx();
  const body: DocRow[] = rows.map((row) => {
    forexCount += row.forexCount;
    momoCount += row.momoCount;
    forexTurnover = money(forexTurnover.minor + row.forexTurnover.minor, BASE_CURRENCY);
    momoVolume = money(momoVolume.minor + row.momoVolume.minor, BASE_CURRENCY);
    income = money(income.minor + row.incomeTotal.minor, BASE_CURRENCY);
    expenses = money(expenses.minor + row.expenseTotal.minor, BASE_CURRENCY);
    return {
      cells: [
        textCell(row.label),
        countCell(row.forexCount),
        amountCell(row.forexTurnover),
        countCell(row.momoCount),
        amountCell(row.momoVolume),
        amountCell(row.incomeTotal),
        amountCell(row.expenseTotal),
      ],
    };
  });
  body.push({
    strong: true,
    cells: [
      textCell("Total"),
      countCell(forexCount),
      amountCell(forexTurnover),
      countCell(momoCount),
      amountCell(momoVolume),
      amountCell(income),
      amountCell(expenses),
    ],
  });

  return { id: "branches", title: "Branch performance", basis, columns, rows: body };
}

function tellerSection(rows: readonly TellerPerformance[], basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Teller", align: "left", width: 34 },
    { label: "Transactions", align: "right", width: 14 },
    { label: `Value (${BASE_CURRENCY})`, align: "right", width: 18 },
  ];

  if (rows.length === 0) {
    return {
      id: "tellers",
      title: "Teller performance",
      basis,
      columns,
      rows: [],
      emptyText: "No member of staff recorded activity in this period.",
    };
  }

  let count = 0;
  let value = ugx();
  const body: DocRow[] = rows.map((row) => {
    count += row.count;
    value = money(value.minor + row.value.minor, BASE_CURRENCY);
    return {
      cells: [textCell(row.name), countCell(row.count), amountCell(row.value)],
    };
  });
  body.push({
    strong: true,
    cells: [textCell("Total"), countCell(count), amountCell(value)],
  });

  return { id: "tellers", title: "Teller performance", basis, columns, rows: body };
}

function cashSection(report: PeriodReport, basis: string): DocSection {
  const columns: DocColumn[] = [
    { label: "Code", align: "left", width: 9 },
    { label: "Account", align: "left", width: 36 },
    { label: "Debits", align: "right", width: 16 },
    { label: "Credits", align: "right", width: 16 },
    { label: "Net movement", align: "right", width: 17 },
  ];
  const rows = report.trial.rows.filter((row) => CASH_ACCOUNT_CODES.includes(row.code));
  if (rows.length === 0) {
    return {
      id: "cash",
      title: "Cash and bank movement",
      basis,
      columns,
      rows: [],
      emptyText: `No account ${CASH_ACCOUNT_CODES.join(" or ")} exists in the chart of accounts.`,
    };
  }

  const body: DocRow[] = rows.map((row) => ({
    cells: [
      textCell(row.code),
      textCell(row.name),
      amountCell(row.debit),
      amountCell(row.credit),
      amountCell(money(row.debit.minor - row.credit.minor, BASE_CURRENCY)),
    ],
  }));

  return { id: "cash", title: "Cash and bank movement", basis, columns, rows: body };
}

/**
 * Builds the document. The figures come from the same report objects the screen
 * renders, so a printed copy can never drift from the page it was printed from.
 */
export function buildReportDocument(input: ReportDocumentInput): ReportDocument {
  const { range, locale, report, prior } = input;
  const days = dayCount(range);
  const periodText = `${longDate(range.from, locale)} to ${longDate(range.to, locale)}`;
  const ledgerBasis = `Posted journal lines, ${periodText}`;
  const operationsBasis = `Records in ${periodText} that have not been reversed or corrected`;
  const currency = getCurrency(BASE_CURRENCY);
  const decimals = currency.decimals;

  const incomeChange = prior
    ? changeVsPrevious(report.incomeTotal, prior.report.incomeTotal)
    : null;
  const expenseChange = prior
    ? changeVsPrevious(report.expenseTotal, prior.report.expenseTotal)
    : null;
  const profitChange = prior ? changeVsPrevious(report.netProfit, prior.report.netProfit) : null;
  const priorLabel = prior
    ? `${longDate(prior.range.from, locale)} to ${longDate(prior.range.to, locale)}`
    : null;
  const figureNote = (change: ReturnType<typeof changeVsPrevious>): string | undefined => {
    if (!change || !priorLabel) return undefined;
    return `${change.delta} against ${priorLabel}`;
  };

  const forex = input.forex;
  const momo = input.momo;

  const difference = money(
    report.trial.debitTotal.minor - report.trial.creditTotal.minor,
    BASE_CURRENCY,
  );
  const netCheck = report.incomeTotal.minor - report.expenseTotal.minor === report.netProfit.minor;

  const checks: DocCheck[] = [
    {
      label: "Trial balance debits equal credits",
      ok: report.trial.balanced,
      detail: `Debits ${formatMoney(report.trial.debitTotal)} · Credits ${formatMoney(
        report.trial.creditTotal,
      )} · Difference ${formatMoney(difference)}`,
    },
    {
      label: "Net profit equals income less expenses",
      ok: netCheck,
      detail: `${formatMoney(report.incomeTotal)} − ${formatMoney(
        report.expenseTotal,
      )} = ${formatMoney(report.netProfit)}`,
    },
  ];

  const exclusions: string[] = [];
  if (forex.excluded > 0) {
    exclusions.push(
      `${forex.excluded} corrected or deleted forex trade${forex.excluded === 1 ? "" : "s"}`,
    );
  }
  if (momo.excluded > 0) {
    exclusions.push(
      `${momo.excluded} reversed mobile money transaction${momo.excluded === 1 ? "" : "s"}`,
    );
  }

  const notes = [
    "Financial sections are built only from posted journal lines for the period; no figure in them is keyed in by hand.",
    "The ledger is append-only. A correction reverses the original entry and posts the replacement, so both appear in the period and the net effect is the corrected figure.",
    "Trial balance figures are the movement for the period, not balances carried forward. Opening balances from earlier periods are not included, so this is not a balance sheet.",
    exclusions.length > 0
      ? `Operational sections count each record once: ${exclusions.join(" and ")} are left out because their ledger entries were reversed.`
      : "Operational sections count each record once; nothing in the period has been reversed or corrected.",
    `Amounts are in ${currency.code} (${currency.name}), written with ${decimals} decimal place${decimals === 1 ? "" : "s"}.`,
    `Branch scope: ${input.branchScope}. Figures cover exactly the rows this sign-in may read.`,
  ];

  const identity: DocIdentity[] = [
    { label: "Reporting period", value: periodText },
    { label: "Days in period", value: days === null ? "—" : String(days) },
    { label: "Base currency", value: currency.code },
    { label: "Journal entries", value: String(input.entries) },
    { label: "Journal lines", value: String(report.postedLines) },
    { label: "Branch scope", value: input.branchScope },
    { label: "Prepared by", value: input.preparedBy },
    { label: "Generated", value: timestamp(input.generatedAt) },
  ];

  return {
    company: input.company,
    title: "Financial report",
    subtitle: periodText,
    identity,
    figures: [
      {
        label: "Income",
        value: formatMoney(report.incomeTotal),
        note: figureNote(incomeChange) ?? "Credits posted in the period",
      },
      {
        label: "Expenses",
        value: formatMoney(report.expenseTotal),
        note: figureNote(expenseChange) ?? "Debits posted in the period",
      },
      {
        label: report.netProfit.minor < 0n ? "Net loss" : "Net profit",
        value: formatMoney(report.netProfit),
        note:
          figureNote(profitChange) ??
          (report.netProfit.minor < 0n ? "Loss for the period" : "Income less expenses"),
      },
      {
        label: "Forex margin",
        value: formatMoney(forex.margin),
        note: `${forex.trades} trade${forex.trades === 1 ? "" : "s"} in ${periodText}`,
      },
    ],
    sections: [
      profitAndLossSection(
        report,
        prior?.report ?? null,
        priorLabel ? `${ledgerBasis} · compared with ${priorLabel}` : ledgerBasis,
      ),
      trialBalanceSection(report, ledgerBasis),
      monthlySection(input.trend, input.trendFrom, range, locale),
      forexSection(forex, operationsBasis),
      momoSection(momo, operationsBasis),
      branchSection(input.branchRows, operationsBasis),
      tellerSection(input.tellerRows, operationsBasis),
      cashSection(report, ledgerBasis),
    ],
    checks,
    notes,
    fileName: `findesk-financial-report-${range.from}-to-${range.to}`,
  };
}
