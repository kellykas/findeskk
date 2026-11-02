/**
 * Ledger data access.
 *
 * Reads come from `public.account_balances` (a security-invoker view, so RLS on
 * journal lines still applies) and the journal tables. Writes go through
 * `post_journal_entry()`; the tables themselves are read-only to clients.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BASE_CURRENCY } from "@/domain/currency";
import {
  ACCOUNT_TYPES,
  buildTrialBalance,
  type AccountType,
  type NormalBalance,
  type JournalSide,
  type TrialBalance,
} from "@/domain/ledger";
import { getCurrency } from "@/domain/currency";
import { money, toDecimalString, type Money } from "@/domain/money";

interface NumericRow {
  total_debit: string | number | null;
  total_credit: string | number | null;
  balance: string | number | null;
}

export interface AccountBalanceRow extends NumericRow {
  account_id: string;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
  active: boolean;
}

export interface LedgerAccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  active: boolean;
  debit: Money;
  credit: Money;
  balance: Money;
}

export interface JournalLineRow {
  id: string;
  entry_id: string;
  account_id: string;
  branch_id: string | null;
  side: string;
  amount: string | number;
  memo: string;
}

export interface JournalEntryRow {
  id: string;
  reference: string;
  entry_date: string;
  description: string;
  entry_type: string;
  branch_id: string | null;
  reverses_entry_id: string | null;
  created_by: string;
  created_at: string;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  branchId: string | null;
  side: JournalSide;
  amount: Money;
  memo: string;
}

export interface JournalEntry {
  id: string;
  reference: string;
  entryDate: string;
  description: string;
  entryType: string;
  branchId: string | null;
  reversesEntryId: string | null;
  createdBy: string;
  createdAt: string;
  debitTotal: Money;
  creditTotal: Money;
  lines: JournalEntryLine[];
}

const TYPE_SET = new Set<string>(ACCOUNT_TYPES);

/**
 * PostgREST returns numeric columns as strings with fixed scale ("500000.00").
 * The base currency may use fewer decimals, so trim rather than reject.
 */
function toMoney(value: string | number | null): Money {
  const text = String(value ?? "0").trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const { decimals } = getCurrency(BASE_CURRENCY);
  const minor = `${whole}${fraction.padEnd(decimals, "0").slice(0, decimals)}`.replace(/\D/g, "");
  const value_ = BigInt(minor || "0");
  return money(negative ? -value_ : value_, BASE_CURRENCY);
}

function assertAccountType(value: string): AccountType {
  if (!TYPE_SET.has(value)) throw new Error(`Unknown account type: ${value}`);
  return value as AccountType;
}

function assertNormalBalance(value: string): NormalBalance {
  if (value !== "debit" && value !== "credit") {
    throw new Error(`Unknown normal balance: ${value}`);
  }
  return value;
}

export function mapAccountBalances(rows: AccountBalanceRow[]): LedgerAccountBalance[] {
  return rows.map((row) => ({
    accountId: row.account_id,
    code: row.code,
    name: row.name,
    type: assertAccountType(row.type),
    normalBalance: assertNormalBalance(row.normal_balance),
    active: row.active,
    debit: toMoney(row.total_debit),
    credit: toMoney(row.total_credit),
    balance: toMoney(row.balance),
  }));
}

export function toTrialBalance(accounts: LedgerAccountBalance[]): TrialBalance {
  return buildTrialBalance(
    accounts.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
      debit: account.debit,
      credit: account.credit,
    })),
  );
}

/** Groups journal lines under their entry, debits first, and totals each entry. */
export function mapJournalEntries(
  entries: JournalEntryRow[],
  lines: JournalLineRow[],
): JournalEntry[] {
  const linesByEntry = new Map<string, JournalEntryLine[]>();
  for (const line of lines) {
    if (line.side !== "debit" && line.side !== "credit") continue;
    const mapped: JournalEntryLine = {
      id: line.id,
      accountId: line.account_id,
      branchId: line.branch_id,
      side: line.side,
      amount: toMoney(line.amount),
      memo: line.memo,
    };
    const list = linesByEntry.get(line.entry_id) ?? [];
    list.push(mapped);
    linesByEntry.set(line.entry_id, list);
  }

  return entries.map((entry) => {
    const entryLines = (linesByEntry.get(entry.id) ?? []).sort((a, b) =>
      a.side === b.side ? 0 : a.side === "debit" ? -1 : 1,
    );
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const line of entryLines) {
      if (line.side === "debit") debitTotal += line.amount.minor;
      else creditTotal += line.amount.minor;
    }

    return {
      id: entry.id,
      reference: entry.reference,
      entryDate: entry.entry_date,
      description: entry.description,
      entryType: entry.entry_type,
      branchId: entry.branch_id,
      reversesEntryId: entry.reverses_entry_id,
      createdBy: entry.created_by,
      createdAt: entry.created_at,
      debitTotal: { minor: debitTotal, currency: BASE_CURRENCY },
      creditTotal: { minor: creditTotal, currency: BASE_CURRENCY },
      lines: entryLines,
    };
  });
}

export async function listAccountBalances(): Promise<LedgerAccountBalance[]> {
  const { data, error } = await supabase
    .from("account_balances")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return mapAccountBalances((data ?? []) as unknown as AccountBalanceRow[]);
}

export async function listRecentEntries(limit = 20): Promise<JournalEntry[]> {
  const { data: entries, error: entryError } = await supabase
    .from("journal_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (entryError) throw new Error(entryError.message);

  const rows = (entries ?? []) as unknown as JournalEntryRow[];
  if (rows.length === 0) return [];

  const { data: lines, error: lineError } = await supabase
    .from("journal_lines")
    .select("*")
    .in(
      "entry_id",
      rows.map((entry) => entry.id),
    );
  if (lineError) throw new Error(lineError.message);

  return mapJournalEntries(rows, (lines ?? []) as unknown as JournalLineRow[]);
}

export interface PostJournalEntryInput {
  entryDate: string;
  description: string;
  entryType?: string;
  branchId?: string | null;
  idempotencyKey?: string | null;
  reversesEntryId?: string | null;
  lines: { accountCode: string; side: JournalSide; amount: Money; memo?: string }[];
}

/**
 * Posts a balanced entry atomically. Retries with the same idempotency key return
 * the original entry instead of posting twice.
 */
export async function postJournalEntry(input: PostJournalEntryInput): Promise<string> {
  const { data, error } = await supabase.rpc("post_journal_entry", {
    _entry_date: input.entryDate,
    _description: input.description,
    _entry_type: input.entryType ?? "manual",
    _branch_id: input.branchId ?? null,
    _lines: input.lines.map((line) => ({
      account_code: line.accountCode,
      side: line.side,
      amount: toDecimalString(line.amount),
      memo: line.memo ?? "",
    })),
    _idempotency_key: input.idempotencyKey ?? null,
    _reverses_entry_id: input.reversesEntryId ?? null,
  });
  if (error) throw new Error(ledgerErrorMessage(error.message));
  return data as string;
}

export function ledgerErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (text.includes("forbidden")) return "Your roles cannot post journal entries.";
  if (text.includes("not assigned to this branch")) return "You are not assigned to that branch.";
  if (text.includes("not balanced")) return "The entry does not balance. Check the amounts.";
  if (text.includes("immutable"))
    return "Posted entries cannot be changed. Post a reversing entry.";
  if (text.includes("unknown or inactive account"))
    return "One of the accounts is unknown or inactive.";
  return message;
}

export const accountBalancesQuery = queryOptions({
  queryKey: ["ledger", "balances"],
  queryFn: listAccountBalances,
});

export function recentEntriesQuery(limit = 20) {
  return queryOptions({
    queryKey: ["ledger", "entries", limit],
    queryFn: () => listRecentEntries(limit),
  });
}
