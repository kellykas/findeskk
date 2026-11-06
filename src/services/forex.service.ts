/**
 * Forex bureau data access.
 *
 * Rates are append-only history (managers insert, nobody edits). Trades are
 * branch-scoped by RLS and written only through record_fx_transaction(), which
 * re-checks the published rate and posts the balanced journal entry in the
 * same transaction.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  FX_SETTLEMENTS,
  FX_TYPES,
  type FxCurrency,
  type FxSettlement,
  type FxType,
} from "@/domain/forex";
import { money, parseMoney, toDecimalString, type Money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import { toMoney } from "./ledger.service";
import { fetchAllPages } from "./paged-rows";

export interface FxRate {
  id: string;
  currency: FxCurrency;
  buyRate: string;
  sellRate: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface FxRateRow {
  id: string;
  currency: string;
  buy_rate: string | number;
  sell_rate: string | number;
  effective_from: string;
  created_at: string;
}

export interface FxRecord {
  id: string;
  type: FxType;
  currency: FxCurrency;
  foreignAmount: Money;
  rate: string;
  costRate: string;
  ugxAmount: Money;
  costAmount: Money;
  margin: Money;
  settlement: FxSettlement;
  branchId: string;
  customerRef: string;
  receiptNo: string;
  notes: string;
  entryDate: string;
  createdBy: string | null;
  createdAt: string;
}

export interface FxRow {
  id: string;
  type: string;
  currency: string;
  foreign_amount: string | number;
  rate: string | number;
  cost_rate: string | number;
  ugx_amount: string | number;
  cost_amount: string | number;
  margin: string | number;
  settlement: string;
  branch_id: string;
  customer_ref: string;
  receipt_no: string;
  notes: string;
  entry_date: string;
  created_by: string | null;
  created_at: string;
}

const TYPE_SET = new Set<string>(FX_TYPES);
const SETTLEMENT_SET = new Set<string>(FX_SETTLEMENTS);

/**
 * Currencies are managed rows, so any three letter code is valid here; only a
 * malformed value is an error.
 */
function assertCurrency(value: string): FxCurrency {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`Unknown currency: ${value}`);
  return code;
}

export function mapFxRate(row: FxRateRow): FxRate {
  return {
    id: row.id,
    currency: assertCurrency(row.currency),
    buyRate: String(row.buy_rate),
    sellRate: String(row.sell_rate),
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
  };
}

/** Latest rate per currency; rows must be ordered newest first. */
export function latestRates(rates: FxRate[]): FxRate[] {
  const seen = new Set<string>();
  const latest: FxRate[] = [];
  for (const rate of rates) {
    if (seen.has(rate.currency)) continue;
    seen.add(rate.currency);
    latest.push(rate);
  }
  return latest.sort((a, b) => a.currency.localeCompare(b.currency));
}

export function mapFxTransaction(row: FxRow): FxRecord {
  if (!TYPE_SET.has(row.type)) throw new Error(`Unknown forex transaction type: ${row.type}`);
  if (!SETTLEMENT_SET.has(row.settlement)) throw new Error(`Unknown settlement: ${row.settlement}`);
  const currency = assertCurrency(row.currency);
  return {
    id: row.id,
    type: row.type as FxType,
    currency,
    foreignAmount: parseMoney(String(row.foreign_amount), currency),
    rate: String(row.rate),
    costRate: String(row.cost_rate),
    ugxAmount: toMoney(row.ugx_amount),
    costAmount: toMoney(row.cost_amount),
    margin: toMoney(row.margin),
    settlement: row.settlement as FxSettlement,
    branchId: row.branch_id,
    customerRef: row.customer_ref,
    receiptNo: row.receipt_no,
    notes: row.notes,
    entryDate: row.entry_date,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export function mapFxTransactions(rows: FxRow[]): FxRecord[] {
  return rows.map(mapFxTransaction);
}

export async function listFxRates(): Promise<FxRate[]> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("*")
    .order("currency", { ascending: true })
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapFxRate(row as unknown as FxRateRow));
}

export async function listFxTransactions(limit = 100): Promise<FxRecord[]> {
  const { data, error } = await supabase
    .from("fx_transactions")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return mapFxTransactions((data ?? []) as unknown as FxRow[]);
}

export interface RecordFxInput {
  type: FxType;
  currency: FxCurrency;
  foreignAmount: Money;
  rate: string;
  costRate: string;
  settlement: FxSettlement;
  branchId: string;
  customerRef: string;
  receiptNo: string;
  notes: string;
  entryDate: string;
  idempotencyKey: string;
}

export async function recordFxTransaction(input: RecordFxInput): Promise<string> {
  const { data, error } = await supabase.rpc("record_fx_transaction", {
    _type: input.type,
    _currency: input.currency,
    _foreign_amount: toDecimalString(input.foreignAmount),
    _rate: input.rate,
    _cost_rate: input.costRate,
    _settlement: input.settlement,
    _branch_id: input.branchId,
    _customer_ref: input.customerRef,
    _receipt_no: input.receiptNo,
    _notes: input.notes,
    _entry_date: input.entryDate,
    _idempotency_key: input.idempotencyKey,
  } as never);
  if (error) throw new Error(fxErrorMessage(error.message));
  return data as string;
}

export interface SetFxRateInput {
  currency: FxCurrency;
  buyRate: string;
  sellRate: string;
  effectiveFrom: string;
}

/** Rates are append-only: publishing a rate adds a row, it never edits one. */
export async function setFxRate(input: SetFxRateInput): Promise<void> {
  const { error } = await supabase.from("fx_rates").insert({
    currency: input.currency,
    buy_rate: input.buyRate,
    sell_rate: input.sellRate,
    effective_from: input.effectiveFrom,
  } as never);
  if (error) throw new Error(fxErrorMessage(error.message));
}

export function fxErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("no exchange rate is set"))
    return "No rate is published for that currency yet. Ask a rate manager to publish one.";
  if (text.includes("refresh the rates"))
    return "The published rate changed. Refresh and try again.";
  if (text.includes("cannot record forex")) return "Your roles cannot record forex transactions.";
  if (text.includes("not assigned to this branch")) return "You are not assigned to that branch.";
  if (text.includes("entry date cannot be in the future"))
    return "Entry date cannot be in the future.";
  if (text.includes("unknown currency")) return "Choose a valid currency.";
  if (text.includes("invalid or inactive branch")) return "Select an active branch.";
  if (text.includes("staff profile not found")) return "Your staff profile is inactive.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Only a rate manager can publish exchange rates.";
  if (text.includes("duplicate key") || text.includes("unique"))
    return "That trade was already recorded.";
  return message;
}

export const fxRatesQuery = queryOptions({
  queryKey: ["forex", "rates"],
  queryFn: listFxRates,
});

export function fxQuery(limit = 100) {
  return queryOptions({
    queryKey: ["forex", "transactions", limit],
    queryFn: () => listFxTransactions(limit),
  });
}

/** Every trade inside a date range, for reports that must total the whole period. */
export async function listFxTransactionsInRange(from: string, to: string): Promise<FxRecord[]> {
  const rows = await fetchAllPages<FxRow>((pageFrom, pageTo) =>
    supabase
      .from("fx_transactions")
      .select("*")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(pageFrom, pageTo),
  );
  return mapFxTransactions(rows);
}

export function fxRangeQuery(range: { from: string; to: string }) {
  return queryOptions({
    queryKey: ["forex", "range", range.from, range.to],
    queryFn: () => listFxTransactionsInRange(range.from, range.to),
  });
}
