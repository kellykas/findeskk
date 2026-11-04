import { cn } from "@/lib/utils";
import { brandInitials } from "@/domain/branding";
import { useBranding } from "@/hooks/use-branding";

/**
 * The company mark: the uploaded logo when there is one, otherwise a monogram
 * built from the website name. Decorative, so it is hidden from assistive tech.
 */
export function BrandMark({ className }: { className?: string }) {
  const { appName, logoUrl } = useBranding();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn(
          "h-10 w-10 shrink-0 rounded-xl border border-border/60 bg-card object-contain p-1 shadow-sm",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.48_0.2_280)] text-sm font-bold text-primary-foreground shadow-sm",
        className,
      )}
    >
      {brandInitials(appName)}
    </span>
  );
}
