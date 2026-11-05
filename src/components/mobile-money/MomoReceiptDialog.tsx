import { createPortal } from "react-dom";

import { ReceiptPaperPicker } from "@/components/receipts/ReceiptPaperPicker";
import { ReceiptQrCode } from "@/components/receipts/ReceiptQrCode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, type Money } from "@/domain/money";
import { receiptPageStyle, receiptSheetStyle, type ReceiptPaper } from "@/domain/receiptPaper";
import { useReceiptPaper } from "@/hooks/use-receipt-paper";
import {
  momoNetworkLabel,
  MOMO_TYPE_LABELS,
  momoCashMovement,
  type MomoNetwork,
  type MomoType,
} from "@/domain/momo";
import type { CompanySettings } from "@/domain/settings";

/** Everything a receipt needs, built from either a fresh recording or a listed row. */
export interface MomoReceiptData {
  id: string;
  branchId: string;
  network: MomoNetwork;
  type: MomoType;
  amount: Money;
  commission: Money;
  entryDate: string;
  customer: string;
  networkRef: string;
  notes: string;
}

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

function ReceiptSheet({
  receipt,
  settings,
  branchName,
  servedBy,
  networkName,
  paper,
  className,
}: {
  receipt: MomoReceiptData;
  settings: CompanySettings;
  branchName: string;
  servedBy: string;
  /** Company-set network name; falls back to the code. */
  networkName?: string | undefined;
  paper: ReceiptPaper;
  className?: string;
}) {
  const cash = momoCashMovement(receipt.type, receipt.amount, receipt.commission);
  const documentNo = `MM-${receipt.id.slice(0, 8).toUpperCase()}`;

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
        Mobile money {receipt.type === "deposit" ? "deposit" : "withdrawal"}
      </div>
      <div className="mt-1 flex justify-between">
        <span>No. {documentNo}</span>
        <span>{day(receipt.entryDate)}</span>
      </div>
      <div className="flex justify-between">
        <span>Branch: {branchName}</span>
        <span>Served by: {servedBy}</span>
      </div>

      <div className="my-2 border-t border-dashed" />

      <Row
        label="Network"
        value={`${networkName ?? momoNetworkLabel(receipt.network)} · ${MOMO_TYPE_LABELS[receipt.type]}`}
      />
      <Row label="Amount" value={formatMoney(receipt.amount)} />
      <Row label="Commission" value={formatMoney(receipt.commission)} />
      <Row
        label={receipt.type === "deposit" ? "Cash received" : "Cash paid out"}
        value={formatMoney(cash)}
        strong
      />
      <Row label="Customer" value={receipt.customer || "Walk-in"} />
      <Row label="Network ref" value={receipt.networkRef || "—"} />

      {receipt.notes && <div className="mt-1">Notes: {receipt.notes}</div>}

      <div className="my-2 border-t border-dashed" />

      <div className="text-center text-muted-foreground">
        Network reference was entered by staff and is not verified with the network.
      </div>

      <div className="mt-2 border-t border-dashed" />

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
        <span className="shrink-0">Date: {day(receipt.entryDate)}</span>
      </div>

      <div className="mt-3 flex justify-center">
        <ReceiptQrCode
          size={96}
          value={`${documentNo}|${receipt.entryDate.slice(0, 10)}|${receipt.type}|${receipt.network}|${receipt.amount.minor}`}
        />
      </div>
    </div>
  );
}

/**
 * Optional receipt for a mobile money transaction: shown after recording and
 * re-openable from any row. Prints at the format and footer set in Settings,
 * using the same print-only portal as the forex receipt.
 */
export function MomoReceiptDialog({
  receipt,
  settings,
  branchName,
  servedBy,
  networkName,
  open,
  onOpenChange,
}: {
  receipt: MomoReceiptData | null;
  settings: CompanySettings | null;
  branchName: string;
  servedBy: string;
  networkName?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Hook before the early return so the order stays stable across renders.
  const { paper, choose } = useReceiptPaper(settings?.receiptFormat ?? "80mm");
  if (!receipt) return null;

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
              Optional — close this if the customer does not want one. Choose the paper loaded in
              the printer; company name and footer come from Settings.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Paper</span>
            <ReceiptPaperPicker value={paper} onChange={choose} />
          </div>

          {settings ? (
            <div className="flex justify-center rounded-md border bg-white p-4 text-foreground">
              <ReceiptSheet
                receipt={receipt}
                settings={settings}
                branchName={branchName}
                servedBy={servedBy}
                networkName={networkName}
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
              receipt={receipt}
              settings={settings}
              branchName={branchName}
              servedBy={servedBy}
              networkName={networkName}
              paper={paper}
              className="mx-auto"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
