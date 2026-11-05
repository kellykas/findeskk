/**
 * Model-backed helpers.
 *
 * The network call lives in a server function so the project key stays on the
 * server. The server never rejects: when the model is unreachable, or the
 * caller is not a signed-in employee, it answers with the deterministic rules
 * suggestion, flagged as such so the interface can say where the idea came
 * from.
 */
import type { CategorySuggestion } from "@/domain/expenseCategory";
import { suggestExpenseCategoryFn } from "@/functions/suggestExpenseCategory";
import { supabase } from "@/integrations/supabase/client";

export async function suggestExpenseCategory(input: {
  description: string;
  amount: string;
}): Promise<CategorySuggestion> {
  // The server verifies this token before spending model credits; an expired
  // session simply falls back to the rules suggestion.
  const { data } = await supabase.auth.getSession();
  return suggestExpenseCategoryFn({
    data: { ...input, accessToken: data.session?.access_token ?? "" },
  });
}
