/**
 * Model-backed helpers.
 *
 * The network call lives in a server function so the project key stays on the
 * server. The server never rejects: when the model is unreachable it answers
 * with the deterministic rules suggestion, flagged as such so the interface can
 * say where the idea came from.
 */
import type { CategorySuggestion } from "@/domain/expenseCategory";
import { suggestExpenseCategoryFn } from "@/functions/suggestExpenseCategory";

export async function suggestExpenseCategory(input: {
  description: string;
  amount: string;
}): Promise<CategorySuggestion> {
  return suggestExpenseCategoryFn({ data: input });
}
