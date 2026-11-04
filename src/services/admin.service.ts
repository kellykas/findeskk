/**
 * Destructive administration.
 *
 * The database decides who may run this and repeats the confirmation check; the
 * interface only decides whether to offer the button.
 */
import { mapResetSummary, type ResetSummary } from "@/domain/reset";
import { supabase } from "@/integrations/supabase/client";

/**
 * The generated Database types predate this function, so the RPC is reached
 * through one narrow signature instead of editing generated code by hand.
 */
interface UntypedRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

export function resetErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("could not find the function") || text.includes("schema cache"))
    return "The reset is not installed yet. Apply the data reset migration in Supabase.";
  if (text.includes("only a super admin") || text.includes("permission denied"))
    return "Only the super admin can delete company data.";
  if (text.includes("type reset")) return "Type RESET to confirm.";
  return message;
}

/** Wipes every transaction, customer and audit record. Configuration is kept. */
export async function resetCompanyData(confirmation: string): Promise<ResetSummary> {
  // Member call on purpose: supabase-js reads `this.rest` inside rpc(), so a
  // hoisted reference throws at call time. See branding.service.ts.
  const client = supabase as unknown as UntypedRpcClient;
  const { data, error } = await client.rpc("reset_company_data", { _confirmation: confirmation });
  if (error) throw new Error(resetErrorMessage(error.message));
  return mapResetSummary(data);
}
