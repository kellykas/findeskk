/**
 * Reference data access: mobile money networks and traded currencies.
 *
 * Reads are RLS-scoped to active staff. Writes go through the database
 * functions, which refuse to delete anything already used by a transaction —
 * that record must keep resolving, so the row is deactivated instead.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  FxCurrencyForm,
  FxCurrencyRecord,
  MomoNetworkForm,
  MomoNetworkRecord,
} from "@/domain/referenceData";
import { referenceErrorMessage } from "@/domain/referenceDataMessages";

interface MomoNetworkRow {
  code: string;
  name: string;
  float_account_code: string;
  active: boolean;
  sort_order: number;
}

interface FxCurrencyRow {
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
}

interface AccountRow {
  code: string;
  name: string;
}

export interface FloatAccountOption {
  code: string;
  name: string;
}

export function mapMomoNetwork(row: MomoNetworkRow): MomoNetworkRecord {
  return {
    code: row.code,
    name: row.name,
    floatAccountCode: row.float_account_code,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export function mapFxCurrency(row: FxCurrencyRow): FxCurrencyRecord {
  return {
    code: row.code,
    name: row.name,
    active: row.active,
    sortOrder: row.sort_order,
  };
}

export async function listMomoNetworks(): Promise<MomoNetworkRecord[]> {
  const { data, error } = await supabase
    .from("momo_networks")
    .select("code, name, float_account_code, active, sort_order")
    .order("sort_order")
    .order("code");
  if (error) throw new Error(error.message);
  return ((data ?? []) as MomoNetworkRow[]).map(mapMomoNetwork);
}

export async function listFxCurrencies(): Promise<FxCurrencyRecord[]> {
  const { data, error } = await supabase
    .from("fx_currencies")
    .select("code, name, active, sort_order")
    .order("sort_order")
    .order("code");
  if (error) throw new Error(error.message);
  return ((data ?? []) as FxCurrencyRow[]).map(mapFxCurrency);
}

/** Asset accounts a wallet's float can be held in. */
export async function listFloatAccounts(): Promise<FloatAccountOption[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("code, name")
    .eq("type", "asset")
    .eq("active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountRow[];
}

export async function saveMomoNetwork(input: MomoNetworkForm): Promise<void> {
  const { error } = await supabase.rpc("save_momo_network", {
    _code: input.code,
    _name: input.name,
    _float_account_code: input.floatAccountCode,
    _active: input.active,
    _sort_order: input.sortOrder,
  } as never);
  if (error) throw new Error(referenceErrorMessage(error.message));
}

export async function deleteMomoNetwork(code: string): Promise<void> {
  const { error } = await supabase.rpc("delete_momo_network", { _code: code } as never);
  if (error) throw new Error(referenceErrorMessage(error.message));
}

export async function saveFxCurrency(input: FxCurrencyForm): Promise<void> {
  const { error } = await supabase.rpc("save_fx_currency", {
    _code: input.code,
    _name: input.name,
    _active: input.active,
    _sort_order: input.sortOrder,
  } as never);
  if (error) throw new Error(referenceErrorMessage(error.message));
}

export async function deleteFxCurrency(code: string): Promise<void> {
  const { error } = await supabase.rpc("delete_fx_currency", { _code: code } as never);
  if (error) throw new Error(referenceErrorMessage(error.message));
}

export const momoNetworksQuery = queryOptions({
  queryKey: ["reference", "momo-networks"],
  queryFn: listMomoNetworks,
  staleTime: 60_000,
});

export const fxCurrenciesQuery = queryOptions({
  queryKey: ["reference", "fx-currencies"],
  queryFn: listFxCurrencies,
  staleTime: 60_000,
});

export const floatAccountsQuery = queryOptions({
  queryKey: ["reference", "float-accounts"],
  queryFn: listFloatAccounts,
  staleTime: 300_000,
});
