import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";

import { FormError } from "@/components/shared/FormError";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fxDeletionSchema, FX_SETTLEMENT_LABELS } from "@/domain/forex";
import { formatMoney } from "@/domain/money";
import type { FxRecord } from "@/services/forex.service";

/**
 * Confirms deleting a posted trade.
 *
 * A trade cannot be erased once it is in the ledger, so the server reverses its
 * entry instead and keeps both the reversal and this reason for audit. The
 * dialog says that plainly: the trade leaves the list, the money goes back.
 */
export function DeleteFxTradeDialog({
  trade,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: {
  trade: FxRecord;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = fxDeletionSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give a short reason for the deletion.");
      return;
    }
    setError(null);
    onConfirm(parsed.data.reason);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Delete this trade?</DialogTitle>
            <DialogDescription>
              {trade.type === "buy" ? "Buy" : "Sell"} {trade.currency} ·{" "}
              {formatMoney(trade.foreignAmount)} · {formatMoney(trade.ugxAmount)} ·{" "}
              {FX_SETTLEMENT_LABELS[trade.settlement]}
              {trade.receiptNo ? ` · ${trade.receiptNo}` : ""}
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                A cancelling entry is posted for the same amounts, so {formatMoney(trade.ugxAmount)}{" "}
                goes back to where it came from and the currency holding is restored.
              </p>
              <p>
                The trade leaves this list. Nothing is erased: the reversal, your name and this
                reason stay in the ledger for audit. This cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deletion-reason">Reason</Label>
            <Textarea
              id="deletion-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Recorded twice by mistake"
              required
            />
            <p className="text-xs text-muted-foreground">
              At least 4 characters. Stored with the deletion so auditors can see why.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep trade
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Deleting…" : "Delete trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
