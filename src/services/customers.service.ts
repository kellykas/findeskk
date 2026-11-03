/**
 * Customer data access.
 *
 * Reads and writes go through Supabase; RLS decides who may see or change
 * personal data (auditors see nothing, accountants read but not write).
 * Customers are deactivated, never deleted.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ID_TYPES,
  type CustomerFormInput,
  type CustomerInput,
  type IdType,
} from "@/domain/customers";

export interface CustomerRecord {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  idType: IdType | "";
  idNumber: string;
  notes: string;
  branchId: string | null;
  active: boolean;
  createdAt: string;
}

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  id_type: string;
  id_number: string;
  notes: string;
  branch_id: string | null;
  active: boolean;
  created_at: string;
}

const ID_TYPE_SET = new Set<string>(["", ...ID_TYPES]);

export function mapCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email,
    idType: ID_TYPE_SET.has(row.id_type) ? (row.id_type as IdType | "") : "",
    idNumber: row.id_number,
    notes: row.notes,
    branchId: row.branch_id,
    active: row.active,
    createdAt: row.created_at,
  };
}

export function customerErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Your roles cannot change customer records.";
  if (text.includes("customers_name_valid")) return "Name needs at least 2 characters.";
  if (text.includes("customers_phone_valid"))
    return "Phone can only contain digits, spaces and + ( ) -";
  if (text.includes("customers_lengths_valid")) return "One of the fields is too long.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  return message;
}

export async function listCustomers(): Promise<CustomerRecord[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("code", { ascending: true });
  if (error) throw new Error(customerErrorMessage(error.message));
  return (data ?? []).map((row) => mapCustomer(row as unknown as CustomerRow));
}

function toRow(input: CustomerInput) {
  return {
    name: input.name,
    phone: input.phone,
    email: input.email,
    id_type: input.idType,
    id_number: input.idNumber,
    notes: input.notes,
    branch_id: input.branchId === "" ? null : input.branchId,
  };
}

export async function createCustomer(input: CustomerInput): Promise<void> {
  const { error } = await supabase.from("customers").insert(toRow(input));
  if (error) throw new Error(customerErrorMessage(error.message));
}

export async function updateCustomer(input: CustomerFormInput & { id: string }): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update({ ...toRow(input), active: input.active })
    .eq("id", input.id);
  if (error) throw new Error(customerErrorMessage(error.message));
}

export const customersQuery = queryOptions({
  queryKey: ["customers", "list"],
  queryFn: listCustomers,
});
