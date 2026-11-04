import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReceiptPaperPicker } from "@/components/receipts/ReceiptPaperPicker";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { receiptPageStyle, receiptSheetStyle, type ReceiptPaper } from "@/domain/receiptPaper";
import { useReceiptPaper } from "@/hooks/use-receipt-paper";
import { fxCurrencyLabel, FX_SETTLEMENT_LABELS, FX_TYPE_LABELS, formatRate } from "@/domain/forex";
import type { CompanySettings } from "@/domain/settings";
import type { FxRecord } from "@/services/forex.service";

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "tabular font-semibold" : "tabular"}>{value}</span>
    </div>
  );
}

/**
 * The printed document itself. Rendered twice — once as a preview inside the
 * dialog and once into a print-only portal — so what prints is exactly what was
 * reviewed on screen.
 */
function ReceiptSheet({
  trade,
  settings,
  branchName,
  servedBy,
  paper,
  className,
}: {
  trade: FxRecord;
  settings: CompanySettings;
  branchName: string;
  servedBy: string;
  paper: ReceiptPaper;
  className?: string;
}) {
  const title = trade.type === "buy" ? "Foreign currency purchase" : "Foreign currency sale";
  const documentNo = trade.receiptNo || trade.id.slice(0, 8).toUpperCase();

  return (
    <div className={`text-black ${className ?? ""}`} style={receiptSheetStyle(paper)}>
      <div className="text-center">
        <div className="text-sm font-semibold uppercase tracking-wide">{settings.companyName}</div>
        {settings.address && <div className="text-muted-foreground">{settings.address}</div>}
        <div className="text-muted-foreground">
          {[settings.phone, settings.email].filter(Boolean).join(" · ")}
        </div>
        {settings.taxNumber && (
          <div className="text-muted-foreground">TIN: {settings.taxNumber}</div>
        )}
      </div>

      <div className="my-2 border-t border-dashed" />

      <div className="text-center font-semibold uppercase tracking-wide">
        {trade.type === "buy" ? "Purchase receipt" : "Sale receipt"}
      </div>
      <div className="mt-1 flex justify-between">
        <span>{trade.receiptNo ? `No. ${documentNo}` : `Ref. ${documentNo}`}</span>
        <span>{day(trade.entryDate)}</span>
      </div>
      <div className="flex justify-between">
        <span>Branch: {branchName}</span>
        <span>Served by: {servedBy}</span>
      </div>

      <div className="my-2 border-t border-dashed" />

      <Row label={title} value={`${FX_TYPE_LABELS[trade.type]} ${trade.currency}`} />
      <Row label="Currency" value={`${trade.currency} · ${fxCurrencyLabel(trade.currency)}`} />
      <Row label="Foreign amount" value={formatMoney(trade.foreignAmount)} />
      <Row label="Rate (UGX)" value={formatRate(trade.rate)} />
      <Row label="Settlement" value={FX_SETTLEMENT_LABELS[trade.settlement]} />

      <div className="my-2 border-t border-dashed" />

      <Row
        label={trade.type === "buy" ? "UGX paid out" : "UGX received"}
        value={formatMoney(trade.ugxAmount)}
        strong
      />
      <Row label="Cost of currency" value={formatMoney(trade.costAmount)} />
      <Row label="Margin" value={formatMoney(trade.margin)} />

      {(trade.customerRef || trade.notes) && <div className="my-2 border-t border-dashed" />}
      {trade.customerRef && <Row label="Customer" value={trade.customerRef} />}
      {trade.notes && <div className="mt-1">Notes: {trade.notes}</div>}

      <div className="my-2 border-t border-dashed" />

      {settings.receiptFooter && (
        <div className="text-center text-muted-foreground">{settings.receiptFooter}</div>
      )}
      <div className="mt-4 flex items-end justify-between gap-4">
        <span className="min-w-0 flex-1">
          {servedBy && servedBy !== "—" && (
            <span className="receipt-signature block">{servedBy}</span>
          )}
          <span className="mt-0.5 block border-t border-dashed pt-0.5 text-muted-foreground">
            Signature
          </span>
        </span>
        <span className="shrink-0">Date: {day(trade.entryDate)}</span>
      </div>
    </div>
  );
}

export function FxReceiptDialog({
  open,
  trade,
  settings,
  branchName,
  servedBy,
  onOpenChange,
}: {
  open: boolean;
  trade: FxRecord | null;
  settings: CompanySettings | null;
  branchName: string;
  servedBy: string;
  onOpenChange: (open: boolean) => void;
}) {
  // Hook before the early return so the order stays stable across renders.
  const { paper, choose } = useReceiptPaper(settings?.receiptFormat ?? "80mm");
  if (!trade) return null;

  async function printReceipt() {
    // The signature uses a locally installed script face; waiting avoids
    // printing a fallback when the first paint is still settling.
    try {
      await document.fonts?.ready;
    } catch {
      // Font loading is best-effort; printing must not be blocked by it.
    }
    window.print();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt</DialogTitle>
            <DialogDescription>
              Choose the paper loaded in the printer. Company name and footer come from Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Paper</span>
            <ReceiptPaperPicker value={paper} onChange={choose} />
          </div>

          {settings ? (
            <div className="flex justify-center rounded-md border bg-white p-4 text-foreground">
              <ReceiptSheet
                trade={trade}
                settings={settings}
                branchName={branchName}
                servedBy={servedBy}
                paper={paper}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Company settings could not be loaded, so the company name and receipt footer are
              missing. Add them in Settings and try again.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => void printReceipt()} disabled={!settings}>
              Print receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print-only copy: everything else in <body> is hidden while printing. */}
      {settings &&
        open &&
        createPortal(
          <div className="receipt-print-root bg-white text-black" data-paper={paper}>
            {/* @page cannot read a class or a variable, so the paper is written
                out literally for the duration of this dialog. */}
            <style>{receiptPageStyle(paper)}</style>
            <ReceiptSheet
              trade={trade}
              settings={settings}
              branchName={branchName}
              servedBy={servedBy}
              paper={paper}
              className="mx-auto"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
