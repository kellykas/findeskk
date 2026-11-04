/**
 * Inter-branch transfer data access.
 *
 * Reads are branch-scoped by RLS; every write goes through
 * record_currency_transfer(), which posts the balanced journal entry in the
 * same transaction as the transfer row.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseMoney, toDecimalString, type Money } from "@/domain/money";
import {
  isTransferCurrency,
  transferErrorMessage,
  type TransferCurrency,
  type TransferRecord,
} from "@/domain/transfers";

export interface TransferRow {
  id: string;
  currency: string;
  amount: string | number;
  from_branch_id: string;
  to_branch_id: string;
  reference: string;
  notes: string;
  entry_date: string;
  created_at: string;
}

export function mapTransfer(row: TransferRow): TransferRecord {
  if (!isTransferCurrency(row.currency)) throw new Error(`Unknown currency: ${row.currency}`);
  const currency = row.currency as TransferCurrency;
  return {
    id: row.id,
    currency,
    amount: parseMoney(String(row.amount), currency),
    fromBranchId: row.from_branch_id,
    toBranchId: row.to_branch_id,
    reference: row.reference,
    notes: row.notes,
    entryDate: row.entry_date,
    createdAt: row.created_at,
  };
}

export function mapTransfers(rows: TransferRow[]): TransferRecord[] {
  return rows.map(mapTransfer);
}

export async function listTransfers(limit = 100): Promise<TransferRecord[]> {
  const { data, error } = await supabase
    .from("currency_transfers")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(transferErrorMessage(error.message));
  return mapTransfers((data ?? []) as unknown as TransferRow[]);
}

export interface RecordTransferInput {
  currency: TransferCurrency;
  amount: Money;
  fromBranchId: string;
  toBranchId: string;
  reference: string;
  notes: string;
  entryDate: string;
  idempotencyKey: string;
}

export async function recordTransfer(input: RecordTransferInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_currency_transfer", {
    _currency: input.currency,
    // Exact decimal string; PostgreSQL NUMERIC parses it without float rounding.
    _amount: toDecimalString(input.amount) as unknown as number,
    _from_branch_id: input.fromBranchId,
    _to_branch_id: input.toBranchId,
    _reference: input.reference,
    _notes: input.notes,
    _entry_date: input.entryDate,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(transferErrorMessage(error.message));
  return data as string;
}

export function transfersQuery(limit = 100) {
  return queryOptions({
    queryKey: ["forex", "transfers", limit],
    queryFn: () => listTransfers(limit),
  });
}
