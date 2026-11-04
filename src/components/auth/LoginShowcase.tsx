import { t } from "@/domain/i18n";

/** What the product covers, listed on the brand panel. Labels only, no figures. */
const COVERAGE = ["Cash", "Float", "Forex", "Mobile money"] as const;

const DOTS = Array.from({ length: 25 }, (_, index) => `dot-${index}`);

/**
 * Brand panel beside the sign-in form. Purely presentational: it shows what the
 * product covers and never displays a balance, rate or other figure, because a
 * decorative number on a login screen would read as real data.
 */
export function LoginShowcase() {
  return (
    <div className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-16 h-64 w-64 rounded-[36px] border border-white/15" />
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 right-8 h-56 w-56 rotate-12 rounded-[40px] bg-white/10" />
        <div className="absolute bottom-40 left-6 h-24 w-24 -rotate-12 rounded-2xl border border-white/15" />
        <div className="absolute right-8 top-8 grid grid-cols-5 gap-2 opacity-40">
          {DOTS.map((dot) => (
            <span key={dot} className="h-1.5 w-1.5 rounded-full bg-white/70" />
          ))}
        </div>
      </div>

      <div className="relative self-end rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
          {t("What you keep in one place")}
        </p>
        <ul className="mt-3 space-y-2">
          {COVERAGE.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
              {t(item)}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative">
        <h2 className="max-w-sm text-[30px] font-semibold leading-tight tracking-tight">
          {t("Everything, on one ledger.")}
        </h2>
        <p className="mt-3 max-w-sm text-sm text-primary-foreground/80">
          {t("Cash, float and foreign currency recorded once and reconciled by the books.")}
        </p>
        <div aria-hidden className="mt-6 flex items-center gap-1.5">
          <span className="h-1.5 w-6 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      </div>
    </div>
  );
}
