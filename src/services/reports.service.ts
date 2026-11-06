/**
 * Report data access.
 *
 * Reads posted journal lines inside a date range. RLS still scopes entries by
 * branch, so a branch user's report only contains their own postings.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_TYPES, type AccountType, type NormalBalance } from "@/domain/ledger";
import type { DatedReportLine, ReportAccount } from "@/domain/reports";
import { fetchAllPages } from "./paged-rows";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
}

interface EntryRow {
  id: string;
  entry_date: string;
}

interface LineRow {
  entry_id: string;
  account_id: string;
  side: string;
  amount: string | number;
}

/**
 * PostgREST caps one response at 1000 rows and keeps the query string below a
 * few kilobytes, so entries are paged and their lines are read in id batches.
 * A twelve month trend would otherwise lose everything past the first page.
 */
const ENTRY_BATCH = 150;

const TYPE_SET = new Set<string>(ACCOUNT_TYPES);

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

export interface LedgerRange {
  from: string;
  to: string;
}

export interface RangeLedger {
  accounts: ReportAccount[];
  /** Lines carry their entry date, so reports can group them by month. */
  lines: DatedReportLine[];
  /** Journal entries that have at least one line in range. */
  entries: number;
}

export async function loadRangeLedger(range: LedgerRange): Promise<RangeLedger> {
  const accountsResult = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance")
    .order("code", { ascending: true });
  if (accountsResult.error) throw new Error(accountsResult.error.message);

  const accounts = ((accountsResult.data ?? []) as unknown as AccountRow[]).map((row) => ({
    accountId: row.id,
    code: row.code,
    name: row.name,
    type: assertAccountType(row.type),
    normalBalance: assertNormalBalance(row.normal_balance),
  }));

  const entries = await fetchAllPages<EntryRow>((pageFrom, pageTo) =>
    supabase
      .from("journal_entries")
      .select("id, entry_date")
      .gte("entry_date", range.from)
      .lte("entry_date", range.to)
      .order("id", { ascending: true })
      .range(pageFrom, pageTo),
  );

  if (entries.length === 0) {
    return { accounts, lines: [], entries: 0 };
  }

  const lineRows: LineRow[] = [];
  for (let index = 0; index < entries.length; index += ENTRY_BATCH) {
    const entryIds = entries.slice(index, index + ENTRY_BATCH).map((entry) => entry.id);
    const rows = await fetchAllPages<LineRow>((pageFrom, pageTo) =>
      supabase
        .from("journal_lines")
        .select("entry_id, account_id, side, amount")
        .in("entry_id", entryIds)
        .order("id", { ascending: true })
        .range(pageFrom, pageTo),
    );
    lineRows.push(...rows);
  }

  const dateByEntry = new Map(entries.map((entry) => [entry.id, entry.entry_date]));
  const lines = lineRows
    .filter((row) => row.side === "debit" || row.side === "credit")
    .map((row) => ({
      accountId: row.account_id,
      side: row.side as "debit" | "credit",
      amount: row.amount,
      date: dateByEntry.get(row.entry_id) ?? range.to,
    }));

  return { accounts, lines, entries: entries.length };
}

export function reportQuery(range: LedgerRange) {
  return queryOptions({
    queryKey: ["reports", "period", range.from, range.to],
    queryFn: () => loadRangeLedger(range),
  });
}
