/**
 * Server function behind the expense category suggestion.
 *
 * Runs on the server so the project's gateway key never reaches the browser.
 * Every failure path returns the deterministic rules suggestion instead of
 * throwing: a model outage must never stop someone recording an expense.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  CATEGORY_PROMPT,
  guessExpenseCategory,
  readSuggestion,
  type CategorySuggestion,
} from "@/domain/expenseCategory";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const TIMEOUT_MS = 12_000;

export interface SuggestionInput {
  description: string;
  amount: string;
}

/** Models sometimes wrap JSON in prose or fences; pull out the object. */
function parseJsonObject(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export const suggestExpenseCategoryFn = createServerFn({ method: "POST" })
  .validator((input: unknown): SuggestionInput => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      description: String(record["description"] ?? "")
        .trim()
        .slice(0, 200),
      amount: String(record["amount"] ?? "").slice(0, 40),
    };
  })
  .handler(async ({ data }): Promise<CategorySuggestion> => {
    const fallback = guessExpenseCategory(data.description);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey || data.description.length < 4) return fallback;

    try {
      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CATEGORY_PROMPT },
            {
              role: "user",
              content: `Description: ${data.description}\nAmount (UGX): ${data.amount || "not given"}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) return fallback;

      const payload = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      return readSuggestion(parseJsonObject(content), fallback);
    } catch {
      return fallback;
    }
  });
