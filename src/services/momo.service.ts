/**
 * Mobile money data access.
 *
 * Reads are branch-scoped by RLS. Writes go through
 * record_momo_transaction(), which posts the balanced journal entry in the
 * same transaction; the table itself is read-only to clients. The network
 * reference stored here is entered by staff and is never network-verified.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MOMO_NETWORKS, MOMO_TYPES, type MomoNetwork, type MomoType } from "@/domain/momo";
import { toDecimalString, type Money } from "@/domain/money";
import { toMoney } from "./ledger.service";

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
  createdAt: string;
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
  created_at: string;
}

const NETWORK_SET = new Set<string>(MOMO_NETWORKS);
const TYPE_SET = new Set<string>(MOMO_TYPES);

export function mapMomoRow(row: MomoRow): MomoRecord {
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
    createdAt: row.created_at,
  };
}

export function mapMomoRows(rows: MomoRow[]): MomoRecord[] {
  return rows.map(mapMomoRow);
}

export async function listMomo(limit = 100): Promise<MomoRecord[]> {
  const { data, error } = await supabase
    .from("momo_transactions")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return mapMomoRows((data ?? []) as unknown as MomoRow[]);
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
  });
  if (error) throw new Error(momoErrorMessage(error.message));
  return data as string;
}

export function momoErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("cannot record mobile money"))
    return "Your roles cannot record mobile money transactions.";
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
  return message;
}

export function momoQuery(limit = 100) {
  return queryOptions({
    queryKey: ["momo", "list", limit],
    queryFn: () => listMomo(limit),
  });
}
