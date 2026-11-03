/**
 * Cash & float snapshot — every figure derived from posted journal entries.
 *
 * There is no separate "cash database": balances come from account_balances
 * and movements from journal lines, so this screen can never disagree with
 * the ledger. An empty ledger produces zeros and empty states.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BASE_CURRENCY } from "@/domain/currency";
import { money, type Money } from "@/domain/money";
import {
  listAccountBalances,
  listRecentEntries,
  type JournalEntry,
  type LedgerAccountBalance,
} from "./ledger.service";

export type CashKind = "physical_cash" | "bank" | "electronic_float" | "imprest";

/** Accounts shown on the cash & float screen, with how they are grouped. */
export const CASH_POSITIONS: Record<string, CashKind> = {
  "1000": "physical_cash",
  "1010": "physical_cash",
  "1100": "bank",
  "1110": "electronic_float",
  "1120": "electronic_float",
  "1200": "imprest",
};

export const CASH_KIND_LABELS: Record<CashKind, string> = {
  physical_cash: "Physical cash",
  bank: "Bank",
  electronic_float: "MoMo float",
  imprest: "Imprest",
};

export interface CashPosition {
  code: string;
  name: string;
  kind: CashKind;
  balance: Money;
  movement: Money;
}

export interface CashBranch {
  branch: string;
  postings: number;
  net: Money;
}

export interface CashPosting {
  id: string;
  date: string;
  reference: string;
  description: string;
  account: string;
  branch: string;
  net: Money;
}

export interface CashTotals {
  physical: Money;
  bank: Money;
  float: Money;
  imprest: Money;
  total: Money;
}

export interface CashSnapshot {
  hasData: boolean;
  positions: CashPosition[];
  totals: CashTotals;
  branches: CashBranch[];
  recent: CashPosting[];
}

export interface CashInput {
  balances: LedgerAccountBalance[];
  entries: JournalEntry[];
  branches: { id: string; name: string }[];
}

const zero = () => money(0n, BASE_CURRENCY);

function add(a: Money, b: Money): Money {
  return money(a.minor + b.minor, BASE_CURRENCY);
}

/**
 * Positions, totals, per-branch net movement and recent cash postings.
 * Movement is computed from the entries supplied (the latest postings), while
 * balances are the full ledger position.
 */
export function buildCashSnapshot(input: CashInput): CashSnapshot {
  const accountById = new Map(input.balances.map((account) => [account.accountId, account]));
  const branchNames = new Map(input.branches.map((branch) => [branch.id, branch.name]));

  const positions = new Map<string, CashPosition>();
  for (const account of input.balances) {
    const kind = CASH_POSITIONS[account.code];
    if (kind === undefined) continue;
    positions.set(account.accountId, {
      code: account.code,
      name: account.name,
      kind,
      balance: account.balance,
      movement: zero(),
    });
  }

  const branchTotals = new Map<string, CashBranch>();
  const entriesByBranch = new Map<string, Set<string>>();
  const recent: CashPosting[] = [];

  for (const entry of input.entries) {
    const entryBranch = entry.branchId
      ? (branchNames.get(entry.branchId) ?? "Unknown branch")
      : "Head office";
    for (const line of entry.lines) {
      const position = positions.get(line.accountId);
      if (!position) continue;
      const delta = line.side === "debit" ? line.amount : money(-line.amount.minor, BASE_CURRENCY);

      position.movement = add(position.movement, delta);

      const branch = line.branchId
        ? (branchNames.get(line.branchId) ?? "Unknown branch")
        : entryBranch;
      const current = branchTotals.get(branch) ?? { branch, postings: 0, net: zero() };
      current.net = add(current.net, delta);
      branchTotals.set(branch, current);

      const seen = entriesByBranch.get(branch) ?? new Set<string>();
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        entriesByBranch.set(branch, seen);
        current.postings += 1;
      }

      recent.push({
        id: line.id,
        date: entry.entryDate,
        reference: entry.reference,
        description: entry.description,
        account: `${position.code} · ${position.name}`,
        branch,
        net: delta,
      });
    }
  }

  const totals: CashTotals = {
    physical: zero(),
    bank: zero(),
    float: zero(),
    imprest: zero(),
    total: zero(),
  };
  for (const position of positions.values()) {
    totals.total = add(totals.total, position.balance);
    if (position.kind === "physical_cash") totals.physical = add(totals.physical, position.balance);
    else if (position.kind === "bank") totals.bank = add(totals.bank, position.balance);
    else if (position.kind === "electronic_float")
      totals.float = add(totals.float, position.balance);
    else totals.imprest = add(totals.imprest, position.balance);
  }

  const sortedPositions = [...positions.values()].sort((a, b) => a.code.localeCompare(b.code));
  const sortedBranches = [...branchTotals.values()].sort((a, b) =>
    a.net.minor === b.net.minor ? 0 : a.net.minor < b.net.minor ? 1 : -1,
  );

  const hasData =
    sortedPositions.some(
      (position) => position.balance.minor !== 0n || position.movement.minor !== 0n,
    ) || recent.length > 0;

  return { hasData, positions: sortedPositions, totals, branches: sortedBranches, recent };
}

export async function getCashSnapshot(): Promise<CashSnapshot> {
  const [balances, entries, branchResult] = await Promise.all([
    listAccountBalances(),
    listRecentEntries(100),
    supabase.from("branches").select("id, name").order("name"),
  ]);
  if (branchResult.error) throw new Error(branchResult.error.message);

  return buildCashSnapshot({
    balances,
    entries,
    branches: branchResult.data ?? [],
  });
}

export const cashQuery = queryOptions({
  queryKey: ["cash", "snapshot"],
  queryFn: getCashSnapshot,
  staleTime: 15_000,
});
