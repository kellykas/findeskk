import { cn } from "@/lib/utils";

/** The FinDesk monogram. Decorative, so it is hidden from assistive tech. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.48_0.2_280)] text-sm font-bold text-primary-foreground shadow-sm",
        className,
      )}
    >
      FD
    </span>
  );
}
