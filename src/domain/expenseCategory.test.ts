import { describe, expect, it } from "vitest";
import { CATEGORY_PROMPT, guessExpenseCategory, readSuggestion } from "./expenseCategory";

describe("guessExpenseCategory", () => {
  it("matches utility bills", () => {
    expect(guessExpenseCategory("October UMEME electricity bill").category).toBe("utilities");
  });

  it("matches salaries before generic words", () => {
    expect(guessExpenseCategory("Staff salaries for September").category).toBe("salaries");
  });

  it("matches bank charges specifically", () => {
    expect(guessExpenseCategory("Bank charges on the collection account").category).toBe(
      "bank_charges",
    );
  });

  it("falls back to miscellaneous with a rationale", () => {
    const suggestion = guessExpenseCategory("Something unusual");
    expect(suggestion.category).toBe("misc");
    expect(suggestion.source).toBe("rules");
    expect(suggestion.rationale.length).toBeGreaterThan(0);
  });

  it("is case insensitive", () => {
    expect(guessExpenseCategory("DIESEL FOR THE GENERATOR").category).toBe("transport");
  });
});

describe("readSuggestion", () => {
  const fallback = guessExpenseCategory("Rent for the Kampala branch");

  it("accepts a well formed model answer", () => {
    const suggestion = readSuggestion(
      { category: "utilities", rationale: "Water bill." },
      fallback,
    );
    expect(suggestion).toEqual({
      category: "utilities",
      rationale: "Water bill.",
      source: "ai",
    });
  });

  it("rejects an unknown category", () => {
    expect(readSuggestion({ category: "marketing", rationale: "Ads." }, fallback)).toEqual(
      fallback,
    );
  });

  it("rejects a missing rationale", () => {
    expect(readSuggestion({ category: "rent", rationale: "" }, fallback)).toEqual(fallback);
  });

  it("rejects payloads that are not objects", () => {
    expect(readSuggestion("rent", fallback)).toEqual(fallback);
    expect(readSuggestion(null, fallback)).toEqual(fallback);
  });
});

describe("CATEGORY_PROMPT", () => {
  it("names every category so the model cannot invent one", () => {
    for (const value of [
      "salaries",
      "rent",
      "utilities",
      "transport",
      "licences",
      "bank_charges",
      "cash_shortage",
      "misc",
    ]) {
      expect(CATEGORY_PROMPT).toContain(value);
    }
  });
});
