/**
 * Employee mobile money float data access.
 *
 * Reads come from momo_staff_float_positions, which is security-invoker: an
 * employee sees their own float, an administrator sees everyone's. Writes go
 * through allocate_momo_staff_float(), which refuses anyone but a super admin
 * or company owner and never lets a take-back exceed what is left.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseAmount, staffFloatErrorMessage, type StaffFloatPosition } from "@/domain/momoFloat";
import { toDecimalString } from "@/domain/money";

interface PositionRow {
  user_id: string;
  network: string;
  currency: string;
  allocated: string | number;
  remaining: string | number;
}

export function mapStaffFloatPosition(row: PositionRow): StaffFloatPosition {
  return {
    userId: row.user_id,
    network: row.network,
    currency: row.currency,
    allocated: parseAmount(row.allocated, row.currency),
    remaining: parseAmount(row.remaining, row.currency),
  };
}

export async function listStaffFloatPositions(): Promise<StaffFloatPosition[]> {
  const { data, error } = await supabase
    .from("momo_staff_float_positions")
    .select("*")
    .order("currency")
    .order("network");
  if (error) throw new Error(error.message);
  return ((data ?? []) as PositionRow[]).map(mapStaffFloatPosition);
}

export const staffFloatPositionsQuery = queryOptions({
  queryKey: ["momo", "staff-float-positions"],
  queryFn: listStaffFloatPositions,
  staleTime: 15_000,
});

export interface AllocateStaffFloatInput {
  userId: string;
  network: string;
  currency: string;
  /** Signed decimal in `currency`; negative takes float back. */
  amount: string;
  note: string;
}

export async function allocateStaffFloat(input: AllocateStaffFloatInput): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_momo_staff_float", {
    _user_id: input.userId,
    _network: input.network,
    _currency: input.currency,
    _amount: toDecimalString(parseAmount(input.amount, input.currency)),
    _note: input.note,
  } as never);
  if (error) throw new Error(staffFloatErrorMessage(error.message));
  return data as string;
}
