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
import { formatMoney } from "@/domain/money";
import {
  momoNetworkLabel,
  MOMO_TYPE_LABELS,
  momoCashMovement,
  momoReversalSchema,
} from "@/domain/momo";
import type { MomoRecord } from "@/services/momo.service";

/**
 * Confirms an authorised reversal. Nothing is edited or deleted: the server
 * posts the cancelling entry and keeps the original for audit, so this dialog
 * says so plainly before asking for a reason.
 */
export function ReverseMomoDialog({
  transaction,
  open,
  saving,
  onOpenChange,
  onConfirm,
}: {
  transaction: MomoRecord;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = momoReversalSchema.safeParse({ reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give a short reason for the reversal.");
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
            <DialogTitle>Reverse this transaction?</DialogTitle>
            <DialogDescription>
              {MOMO_TYPE_LABELS[transaction.type]} · {momoNetworkLabel(transaction.network)} ·{" "}
              {formatMoney(transaction.amount)}
              {transaction.commission.minor > 0n
                ? ` · commission ${formatMoney(transaction.commission)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                A cancelling entry is posted for the same amounts, moving{" "}
                {formatMoney(
                  momoCashMovement(transaction.type, transaction.amount, transaction.commission),
                )}{" "}
                back to where it came from.
              </p>
              <p>The original stays in the ledger marked as reversed. This cannot be undone.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reversal-reason">Reason</Label>
            <Textarea
              id="reversal-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Wrong amount entered"
              required
            />
            <p className="text-xs text-muted-foreground">
              At least 4 characters. Stored with the reversal so auditors can see why.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Keep transaction
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? "Reversing…" : "Reverse transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
