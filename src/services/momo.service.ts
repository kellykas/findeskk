/**
 * Mobile money data access.
 *
 * Reads are branch-scoped by RLS. Writes go through
 * record_momo_transaction(), which posts the balanced journal entry in the
 * same transaction; the table itself is read-only to clients. Reversals go
 * through reverse_momo_transaction(), which posts the cancelling entry and
 * records who reversed what and why. The network reference stored here is
 * entered by staff and is never network-verified.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MOMO_NETWORKS, MOMO_TYPES, type MomoNetwork, type MomoType } from "@/domain/momo";
import { toDecimalString, type Money } from "@/domain/money";
import { toMoney } from "./ledger.service";

export interface MomoReversal {
  id: string;
  reason: string;
  journalEntryId: string;
  reversedBy: string;
  reversedAt: string;
}

export interface MomoRecord {
  id: string;
  network: MomoNetwork;
  type: MomoType;
  amount: Money;
  commission: Money;
  branchId: string;
  customerId: string | null;
  customerRef: string;
  networkRef: string;
  notes: string;
  entryDate: string;
  journalEntryId: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Null while the transaction stands; set once it has been reversed. */
  reversal: MomoReversal | null;
}

export interface MomoRow {
  id: string;
  network: string;
  type: string;
  amount: string | number;
  commission: string | number;
  branch_id: string;
  customer_id: string | null;
  customer_ref: string;
  network_ref: string;
  notes: string;
  entry_date: string;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MomoReversalRow {
  id: string;
  momo_id: string;
  reason: string;
  journal_entry_id: string;
  reversed_by: string;
  created_at: string;
}

const NETWORK_SET = new Set<string>(MOMO_NETWORKS);
const TYPE_SET = new Set<string>(MOMO_TYPES);

export function mapMomoRow(row: MomoRow, reversal: MomoReversalRow | null = null): MomoRecord {
  if (!NETWORK_SET.has(row.network))
    throw new Error(`Unknown mobile money network: ${row.network}`);
  if (!TYPE_SET.has(row.type)) throw new Error(`Unknown transaction type: ${row.type}`);
  return {
    id: row.id,
    network: row.network as MomoNetwork,
    type: row.type as MomoType,
    amount: toMoney(row.amount),
    commission: toMoney(row.commission),
    branchId: row.branch_id,
    customerId: row.customer_id,
    customerRef: row.customer_ref,
    networkRef: row.network_ref,
    notes: row.notes,
    entryDate: row.entry_date,
    journalEntryId: row.journal_entry_id,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    reversal: reversal
      ? {
          id: reversal.id,
          reason: reversal.reason,
          journalEntryId: reversal.journal_entry_id,
          reversedBy: reversal.reversed_by,
          reversedAt: reversal.created_at,
        }
      : null,
  };
}

export function mapMomoRows(rows: MomoRow[], reversals: MomoReversalRow[] = []): MomoRecord[] {
  const byMomo = new Map(reversals.map((reversal) => [reversal.momo_id, reversal]));
  return rows.map((row) => mapMomoRow(row, byMomo.get(row.id) ?? null));
}

export async function listMomo(limit = 100): Promise<MomoRecord[]> {
  const [transactions, reversals] = await Promise.all([
    supabase
      .from("momo_transactions")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("momo_reversals").select("*"),
  ]);

  if (transactions.error) throw new Error(transactions.error.message);

  // A deployment without the reversal migration must still be able to read and
  // record transactions, so a missing table only means "nothing reversed yet";
  // attempting a reversal then reports that the feature is not enabled.
  const reversalRows = reversals.error ? [] : ((reversals.data ?? []) as MomoReversalRow[]);

  return mapMomoRows((transactions.data ?? []) as unknown as MomoRow[], reversalRows);
}

export interface RecordMomoInput {
  network: MomoNetwork;
  type: MomoType;
  amount: Money;
  commission: Money;
  branchId: string;
  customerId: string | null;
  customerRef: string;
  networkRef: string;
  notes: string;
  entryDate: string;
  idempotencyKey: string;
}

export async function recordMomo(input: RecordMomoInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_momo_transaction", {
    _network: input.network,
    _type: input.type,
    _amount: toDecimalString(input.amount),
    _commission: toDecimalString(input.commission),
    _branch_id: input.branchId,
    _customer_id: input.customerId,
    _customer_ref: input.customerRef,
    _network_ref: input.networkRef,
    _notes: input.notes,
    _entry_date: input.entryDate,
    _idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw new Error(momoErrorMessage(error.message));
  return data as string;
}

export async function reverseMomo(input: { momoId: string; reason: string }): Promise<string> {
  const { data, error } = await supabase.rpc("reverse_momo_transaction", {
    _momo_id: input.momoId,
    _reason: input.reason,
  } as never);
  if (error) throw new Error(momoErrorMessage(error.message));
  return data as string;
}

export function momoErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("cannot record mobile money"))
    return "Your roles cannot record mobile money transactions.";
  if (text.includes("cannot reverse transactions"))
    return "Only a super admin, company owner or general manager can reverse a transaction.";
  if (text.includes("already been reversed")) return "That transaction was already reversed.";
  if (text.includes("reason of at least")) return "Give a reason of at least 4 characters.";
  if (text.includes("no journal entry to reverse"))
    return "This transaction has no ledger entry to reverse.";
  if (text.includes("reversible")) return "That transaction cannot be reversed.";
  if (text.includes("not assigned to this branch")) return "You are not assigned to that branch.";
  if (text.includes("commission must be less"))
    return "Commission must be less than the withdrawal amount.";
  if (text.includes("entry date cannot be in the future"))
    return "Entry date cannot be in the future.";
  if (text.includes("unknown mobile money network")) return "Choose MTN or Airtel.";
  if (text.includes("unknown transaction type")) return "Choose a deposit or withdrawal.";
  if (text.includes("invalid or inactive branch")) return "Select an active branch.";
  if (text.includes("unknown customer")) return "That customer no longer exists.";
  if (text.includes("staff profile not found")) return "Your staff profile is inactive.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (text.includes("duplicate key") || text.includes("unique"))
    return "That transaction was already recorded.";
  if (
    text.includes("could not find the function") ||
    text.includes("schema cache") ||
    text.includes("does not exist")
  ) {
    return "Reversals need a one-time database setup before they can be used. Ask your administrator to run the reversal setup file in Supabase — the steps are in docs/ADMIN-SETUP.md.";
  }
  return message;
}

export function momoQuery(limit = 100) {
  return queryOptions({
    queryKey: ["momo", "list", limit],
    queryFn: () => listMomo(limit),
  });
}
