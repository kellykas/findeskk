/**
 * Expense data access.
 *
 * Reads are branch-scoped by RLS. Writes go through record_expense(), which
 * posts the balanced journal entry in the same transaction; the table itself is
 * read-only to clients.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isExpenseCategory, isPaymentSource, type ExpenseRecord } from "@/domain/expenses";
import type { Money } from "@/domain/money";
import { toDecimalString } from "@/domain/money";
import { toMoney } from "./ledger.service";

export interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: string | number;
  paid_from: string;
  branch_id: string;
  reference: string;
  notes: string;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function mapExpense(row: ExpenseRow): ExpenseRecord {
  if (!isExpenseCategory(row.category)) {
    throw new Error(`Unknown expense category: ${row.category}`);
  }
  if (!isPaymentSource(row.paid_from)) {
    throw new Error(`Unknown payment source: ${row.paid_from}`);
  }
  return {
    id: row.id,
    expenseDate: row.expense_date,
    category: row.category,
    description: row.description,
    amount: toMoney(row.amount),
    paidFrom: row.paid_from,
    branchId: row.branch_id,
    reference: row.reference,
    notes: row.notes,
    journalEntryId: row.journal_entry_id,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function listExpenses(limit = 200): Promise<ExpenseRecord[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(expenseErrorMessage(error.message));
  return (data ?? []).map((row) => mapExpense(row as unknown as ExpenseRow));
}

export interface RecordExpenseInput {
  expenseDate: string;
  category: ExpenseRecord["category"];
  description: string;
  amount: Money;
  paidFrom: ExpenseRecord["paidFrom"];
  branchId: string;
  reference: string;
  notes: string;
  idempotencyKey: string;
}

export async function recordExpense(input: RecordExpenseInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_expense", {
    _expense_date: input.expenseDate,
    _category: input.category,
    _description: input.description,
    _amount: toDecimalString(input.amount),
    _paid_from: input.paidFrom,
    _branch_id: input.branchId,
    _reference: input.reference,
    _notes: input.notes,
    _idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw new Error(expenseErrorMessage(error.message));
  return data as string;
}

export function expenseErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("schema cache") || text.includes("could not find the table"))
    return "The expenses table is missing. Apply the Phase 8 migration in Supabase.";
  if (text.includes("cannot record expenses")) return "Your roles cannot record expenses.";
  if (text.includes("not assigned to this branch")) return "You are not assigned to that branch.";
  if (text.includes("unknown expense category")) return "Choose an expense category.";
  if (text.includes("paid from cash or bank")) return "Choose cash or bank as the payment source.";
  if (text.includes("expense date cannot be in the future"))
    return "Expense date cannot be in the future.";
  if (text.includes("invalid or inactive branch")) return "Select an active branch.";
  if (text.includes("staff profile not found")) return "Your staff profile is inactive.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Your roles cannot read or record expenses.";
  if (text.includes("duplicate key") || text.includes("unique"))
    return "That expense was already recorded.";
  return message;
}

export const expensesQuery = queryOptions({
  queryKey: ["expenses", "list"],
  queryFn: () => listExpenses(),
});
