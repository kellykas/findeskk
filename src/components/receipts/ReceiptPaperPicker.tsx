import { RECEIPT_PAPERS, RECEIPT_PAPER_ORDER, type ReceiptPaper } from "@/domain/receiptPaper";
import { cn } from "@/lib/utils";

/**
 * Paper actually loaded in the printer. It changes the page size and the
 * printable width of the printout, so it belongs next to the receipt rather
 * than buried in Settings.
 */
export function ReceiptPaperPicker({
  value,
  onChange,
}: {
  value: ReceiptPaper;
  onChange: (next: ReceiptPaper) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Receipt paper"
      className="flex flex-wrap items-center gap-1 rounded-full border border-border/70 bg-muted/50 p-1"
    >
      {RECEIPT_PAPER_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "h-7 cursor-pointer rounded-full px-2.5 text-[11px] font-medium transition-colors",
            value === id
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {RECEIPT_PAPERS[id].label}
        </button>
      ))}
    </div>
  );
}
