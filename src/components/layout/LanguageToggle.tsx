import { Languages } from "lucide-react";

import { LANGUAGES } from "@/domain/i18n";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/**
 * English / French switch. Like the theme, the choice is a display preference
 * kept in this browser; it never changes company data or stored amounts.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={cn("flex items-center gap-1 rounded-full bg-muted p-1", className)}
    >
      <Languages className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {LANGUAGES.map((option) => (
        <button
          key={option.code}
          type="button"
          lang={option.code}
          aria-pressed={language === option.code}
          title={option.native}
          onClick={() => setLanguage(option.code)}
          className={cn(
            "flex h-7 flex-1 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-semibold uppercase transition-colors",
            language === option.code
              ? "bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.code}
        </button>
      ))}
    </div>
  );
}
