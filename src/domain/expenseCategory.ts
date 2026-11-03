/**
 * Expense category suggestion rules.
 *
 * Two layers, both here so the interface stays dumb:
 *   * `guessExpenseCategory()` is the deterministic fallback used when no model
 *     is reachable, so the button never breaks.
 *   * `readSuggestion()` validates whatever a model returned before the UI is
 *     allowed to apply it — a model answer is untrusted input.
 *
 * A suggestion is only ever a prefill: the person recording the expense still
 * picks the category they want before anything is posted.
 */
import { EXPENSE_CATEGORY_LABELS, isExpenseCategory, type ExpenseCategory } from "./expenses";

export type SuggestionSource = "ai" | "rules";

export interface CategorySuggestion {
  category: ExpenseCategory;
  rationale: string;
  source: SuggestionSource;
}

interface KeywordGroup {
  category: ExpenseCategory;
  words: readonly string[];
}

/**
 * Ordered most specific first. First match wins, so "bank charges" does not
 * fall through to the generic "charges" bucket below it.
 */
const KEYWORD_GROUPS: readonly KeywordGroup[] = [
  {
    category: "salaries",
    words: ["salary", "salaries", "wage", "wages", "payroll", "staff pay", "allowance"],
  },
  {
    category: "rent",
    words: ["rent", "lease", "landlord", "premises"],
  },
  {
    category: "utilities",
    words: [
      "electric",
      "electricity",
      "umeme",
      "water",
      "nwsc",
      "utility",
      "utilities",
      "internet",
      "airtime",
      "data bundle",
      "bill",
    ],
  },
  {
    category: "transport",
    words: [
      "fuel",
      "petrol",
      "diesel",
      "transport",
      "taxi",
      "boda",
      "travel",
      "mileage",
      "vehicle",
    ],
  },
  {
    category: "licences",
    words: [
      "licence",
      "license",
      "permit",
      "regulatory",
      "ura",
      "compliance",
      "renewal",
      "trading licence",
    ],
  },
  {
    category: "bank_charges",
    words: [
      "bank charge",
      "bank fee",
      "ledger fee",
      "sms fee",
      "statement fee",
      "transfer fee",
      "excise",
    ],
  },
  {
    category: "cash_shortage",
    words: ["shortage", "shortfall", "overage", "till difference", "variance", "unreconciled"],
  },
];

const MAX_DESCRIPTION = 200;
const MAX_RATIONALE = 240;

/** Deterministic keyword match; always returns a category. */
export function guessExpenseCategory(description: string): CategorySuggestion {
  const text = description.toLowerCase();

  for (const group of KEYWORD_GROUPS) {
    const hit = group.words.find((word) => text.includes(word));
    if (hit) {
      return {
        category: group.category,
        rationale: `“${hit}” in the description points to ${EXPENSE_CATEGORY_LABELS[group.category]}.`,
        source: "rules",
      };
    }
  }

  return {
    category: "misc",
    rationale:
      "Nothing specific in the description, so Miscellaneous is the safest starting point.",
    source: "rules",
  };
}

/**
 * Turns an untrusted model payload into a suggestion, falling back to the rules
 * whenever the answer is malformed or names an unknown category. Never throws:
 * a bad model answer must not block recording an expense.
 */
export function readSuggestion(payload: unknown, fallback: CategorySuggestion): CategorySuggestion {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;

  const rawCategory =
    typeof record["category"] === "string" ? record["category"].trim().toLowerCase() : "";
  const rawRationale = typeof record["rationale"] === "string" ? record["rationale"].trim() : "";

  if (!isExpenseCategory(rawCategory) || rawRationale.length === 0) return fallback;

  return {
    category: rawCategory,
    rationale: rawRationale.slice(0, MAX_RATIONALE),
    source: "ai",
  };
}

/** Prompt sent to the gateway; kept here so the rules and the ask stay together. */
export const CATEGORY_PROMPT = [
  "You categorise expenses for a Ugandan forex bureau and mobile money agency.",
  "Choose exactly one category from this list:",
  ...Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => `- ${value}: ${label}`),
  "Reply with JSON only, no prose and no code fences:",
  '{"category":"<value from the list>","rationale":"<one short sentence, at most 240 characters>"}',
].join("\n");

export const CATEGORY_PROMPT_ITEM_MAX = MAX_DESCRIPTION;
