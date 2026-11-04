import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LANGUAGE,
  localeFor,
  readStoredLanguage,
  setActiveLanguage,
  storeLanguage,
  translate,
  type Language,
  type TranslationVars,
} from "@/domain/i18n";

interface LanguageContextValue {
  language: Language;
  setLanguage: (next: Language) => void;
  t: (key: string, vars?: TranslationVars) => string;
  locale: string;
}

/**
 * English by default rather than throwing, so a component rendered outside the
 * provider (tests, isolated stories) still works and simply reads in English.
 */
const FALLBACK: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key, vars) => translate(DEFAULT_LANGUAGE, key, vars),
  locale: localeFor(DEFAULT_LANGUAGE),
};

const LanguageContext = createContext<LanguageContextValue>(FALLBACK);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // Storage is read after mount so the server-rendered markup and the first
  // client render agree; the stored choice then applies without a reload.
  useEffect(() => {
    setLanguageState(readStoredLanguage(window.localStorage));
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    storeLanguage(next, window.localStorage);
  }, []);

  // Kept in step during render so plain t() calls in page files read the same
  // language as the components that use the hook.
  setActiveLanguage(language);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
      locale: localeFor(language),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
