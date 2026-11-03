/**
 * Other income data access.
 *
 * Reads are branch-scoped by RLS. Writes go through record_income(), which
 * posts the balanced journal entry in the same transaction; the table itself is
 * read-only to clients.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isIncomeCategory, isIncomeReceiptSource, type IncomeRecord } from "@/domain/income";
import type { Money } from "@/domain/money";
import { toDecimalString } from "@/domain/money";
import { toMoney } from "./ledger.service";
import { incomeErrorMessage } from "@/domain/income";

export interface IncomeRow {
  id: string;
  income_date: string;
  category: string;
  description: string;
  amount: string | number;
  received_into: string;
  branch_id: string;
  reference: string;
  notes: string;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function mapIncome(row: IncomeRow): IncomeRecord {
  if (!isIncomeCategory(row.category)) {
    throw new Error(`Unknown income category: ${row.category}`);
  }
  if (!isIncomeReceiptSource(row.received_into)) {
    throw new Error(`Unknown receipt source: ${row.received_into}`);
  }
  return {
    id: row.id,
    incomeDate: row.income_date,
    category: row.category,
    description: row.description,
    amount: toMoney(row.amount),
    receivedInto: row.received_into,
    branchId: row.branch_id,
    reference: row.reference,
    notes: row.notes,
    journalEntryId: row.journal_entry_id,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function listIncome(limit = 200): Promise<IncomeRecord[]> {
  const { data, error } = await supabase
    .from("incomes")
    .select("*")
    .order("income_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(incomeErrorMessage(error.message));
  return (data ?? []).map((row) => mapIncome(row as unknown as IncomeRow));
}

export interface RecordIncomeInput {
  incomeDate: string;
  category: IncomeRecord["category"];
  description: string;
  amount: Money;
  receivedInto: IncomeRecord["receivedInto"];
  branchId: string;
  reference: string;
  notes: string;
  idempotencyKey: string;
}

export async function recordIncome(input: RecordIncomeInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_income", {
    _income_date: input.incomeDate,
    _category: input.category,
    _description: input.description,
    _amount: toDecimalString(input.amount),
    _received_into: input.receivedInto,
    _branch_id: input.branchId,
    _reference: input.reference,
    _notes: input.notes,
    _idempotency_key: input.idempotencyKey,
  });
  if (error) throw new Error(incomeErrorMessage(error.message));
  return data as string;
}

export const incomesQuery = queryOptions({
  queryKey: ["income", "list"],
  queryFn: () => listIncome(),
});
