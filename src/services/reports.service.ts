/**
 * Report data access.
 *
 * Reads posted journal lines inside a date range. RLS still scopes entries by
 * branch, so a branch user's report only contains their own postings.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_TYPES, type AccountType, type NormalBalance } from "@/domain/ledger";
import type { ReportAccount, ReportLine } from "@/domain/reports";

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  normal_balance: string;
}

interface EntryRow {
  id: string;
}

interface LineRow {
  account_id: string;
  side: string;
  amount: string | number;
}

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
  lines: ReportLine[];
  /** Journal entries that have at least one line in range. */
  entries: number;
}

export async function loadRangeLedger(range: LedgerRange): Promise<RangeLedger> {
  const accountsResult = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance")
    .order("code", { ascending: true });
  if (accountsResult.error) throw new Error(accountsResult.error.message);

  const entriesResult = await supabase
    .from("journal_entries")
    .select("id")
    .gte("entry_date", range.from)
    .lte("entry_date", range.to);
  if (entriesResult.error) throw new Error(entriesResult.error.message);

  const entryIds = ((entriesResult.data ?? []) as unknown as EntryRow[]).map((row) => row.id);
  const accounts = ((accountsResult.data ?? []) as unknown as AccountRow[]).map((row) => ({
    accountId: row.id,
    code: row.code,
    name: row.name,
    type: assertAccountType(row.type),
    normalBalance: assertNormalBalance(row.normal_balance),
  }));

  if (entryIds.length === 0) {
    return { accounts, lines: [], entries: 0 };
  }

  const linesResult = await supabase
    .from("journal_lines")
    .select("account_id, side, amount")
    .in("entry_id", entryIds);
  if (linesResult.error) throw new Error(linesResult.error.message);

  const lines = ((linesResult.data ?? []) as unknown as LineRow[])
    .filter((row) => row.side === "debit" || row.side === "credit")
    .map((row) => ({
      accountId: row.account_id,
      side: row.side as "debit" | "credit",
      amount: row.amount,
    }));

  return { accounts, lines, entries: entryIds.length };
}

export function reportQuery(range: LedgerRange) {
  return queryOptions({
    queryKey: ["reports", "period", range.from, range.to],
    queryFn: () => loadRangeLedger(range),
  });
}
