/**
 * Two-language interface (English and French).
 *
 * The English sentence is the lookup key. That choice is deliberate: a string
 * with no French entry renders as its English text instead of a raw key such as
 * `dashboard.title`, so a screen added today still reads correctly in French
 * until someone translates it.
 */
import { FRENCH } from "./i18n.fr";

export type Language = "en" | "fr";

/** Offered in the language menu. `native` is never translated. */
export const LANGUAGES: ReadonlyArray<{ code: Language; native: string }> = [
  { code: "en", native: "English" },
  { code: "fr", native: "Français" },
];

export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "findesk-language";

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "fr";
}

/** Minimal storage shape, so this stays testable without a browser. */
export interface LanguageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredLanguage(storage?: LanguageStorage | null): Language {
  try {
    const raw = storage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function storeLanguage(language: Language, storage?: LanguageStorage | null): void {
  try {
    storage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Private mode or a blocked store: the choice simply lasts for this visit.
  }
}

export type TranslationVars = Record<string, string | number>;

/**
 * Translates `key` and fills `{placeholders}`. Unknown placeholders are left as
 * written so a missing value shows up in review rather than as "undefined".
 */
export function translate(language: Language, key: string, vars?: TranslationVars): string {
  const template = language === "fr" ? (FRENCH[key] ?? key) : key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Date, number and month names follow the chosen interface language. */
export function localeFor(language: Language): string {
  return language === "fr" ? "fr-FR" : "en-GB";
}

/**
 * The language the interface is currently rendering in. `LanguageProvider`
 * keeps this in step with its state so page files can call {@link t} directly
 * instead of threading a hook through every component.
 */
let activeLanguage: Language = DEFAULT_LANGUAGE;

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

/** Shorthand for `translate(getActiveLanguage(), …)`. */
export function t(key: string, vars?: TranslationVars): string {
  return translate(activeLanguage, key, vars);
}
