import { describe, expect, it } from "vitest";

import {
  DEFAULT_LANGUAGE,
  isLanguage,
  localeFor,
  readStoredLanguage,
  storeLanguage,
  translate,
  type LanguageStorage,
} from "@/domain/i18n";

function memoryStorage(): LanguageStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("interface language", () => {
  it("defaults to English and rejects unsupported codes", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(isLanguage("fr")).toBe(true);
    expect(isLanguage("de")).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it("leaves English untouched and falls back when no French entry exists", () => {
    expect(translate("en", "Sign out")).toBe("Sign out");
    expect(translate("fr", "A sentence nobody has translated yet")).toBe(
      "A sentence nobody has translated yet",
    );
  });

  it("translates interface text that has a French entry", () => {
    expect(translate("fr", "Sign out")).toBe("Se déconnecter");
    expect(translate("fr", "Dashboard")).toBe("Tableau de bord");
  });

  it("fills placeholders and keeps unknown ones visible", () => {
    expect(translate("fr", "Welcome back, {name}!", { name: "Kelly" })).toBe("Bon retour, Kelly !");
    expect(translate("en", "Welcome back, {name}!", { name: "Kelly" })).toBe(
      "Welcome back, Kelly!",
    );
    expect(translate("fr", "Hello {missing}")).toBe("Hello {missing}");
  });

  it("formats dates in the chosen language", () => {
    expect(localeFor("fr")).toBe("fr-FR");
    expect(localeFor("en")).toBe("en-GB");
  });

  it("remembers the choice and survives blocked storage", () => {
    const storage = memoryStorage();
    storeLanguage("fr", storage);
    expect(readStoredLanguage(storage)).toBe("fr");

    const blocked: LanguageStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readStoredLanguage(blocked)).toBe("en");
    expect(() => storeLanguage("fr", blocked)).not.toThrow();
    expect(readStoredLanguage(null)).toBe("en");
  });
});
