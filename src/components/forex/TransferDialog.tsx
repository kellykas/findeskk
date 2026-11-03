import { useEffect, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/shared/FormError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayUtcDate } from "@/domain/date";
import { formatMoney } from "@/domain/money";
import {
  TRANSFER_CURRENCIES,
  TRANSFER_CURRENCY_LABELS,
  parseTransferAmount,
  transferSchema,
  type TransferCurrency,
} from "@/domain/transfers";
import { cn } from "@/lib/utils";
import type { BranchOption } from "./FxDialog";

export interface TransferValues {
  currency: TransferCurrency;
  amount: string;
  fromBranchId: string;
  toBranchId: string;
  reference: string;
  notes: string;
  entryDate: string;
}

/**
 * Moving currency between branches. There is no rate and no margin: the same
 * quantity of the same currency leaves one branch and arrives at the other.
 */
export function TransferDialog({
  branches,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  branches: BranchOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: TransferValues) => void;
}) {
  const [currency, setCurrency] = useState<TransferCurrency>("USD");
  const [amount, setAmount] = useState("");
  const [fromBranchId, setFromBranchId] = useState(branches[0]?.id ?? "");
  const [toBranchId, setToBranchId] = useState(branches[1]?.id ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(todayUtcDate());
  const [error, setError] = useState<string | null>(null);

  // Branches load after mount: pick sensible endpoints rather than leaving both
  // empty, which would keep the submit button disabled forever.
  useEffect(() => {
    const first = branches[0];
    if (!fromBranchId && first) setFromBranchId(first.id);
  }, [branches, fromBranchId]);

  useEffect(() => {
    const destinations = branches.filter((branch) => branch.id !== fromBranchId);
    if (!destinations.some((branch) => branch.id === toBranchId)) {
      const next = destinations[0];
      setToBranchId(next ? next.id : "");
    }
  }, [branches, fromBranchId, toBranchId]);

  const parsed = parseTransferAmount(amount, currency);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = transferSchema(currency).safeParse({
      currency,
      amount,
      fromBranchId,
      toBranchId,
      reference,
      notes,
      entryDate,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setError(null);
    onSave({ currency, amount, fromBranchId, toBranchId, reference, notes, entryDate });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Transfer currency between branches</DialogTitle>
            <DialogDescription>
              The same currency moves from one branch to another through one balanced journal entry.
              No exchange rate or margin applies.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as TransferCurrency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code} · {TRANSFER_CURRENCY_LABELS[code]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-amount">Amount</Label>
              <Input
                id="transfer-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/,/g, ""))}
                inputMode="decimal"
                placeholder={currency === "UGX" ? "500000" : "1000.00"}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>From branch</Label>
            <Select value={fromBranchId} onValueChange={setFromBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the sending branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>To branch</Label>
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the receiving branch" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter((branch) => branch.id !== fromBranchId)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transfer-reference">Reference</Label>
              <Input
                id="transfer-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={40}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-date">Entry date</Label>
              <Input
                id="transfer-date"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                max={todayUtcDate()}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-notes">Notes</Label>
            <Textarea
              id="transfer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {parsed ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount in transit</span>
                <span className={cn("tabular font-medium")}>{formatMoney(parsed)}</span>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Enter an amount to confirm what leaves the sending branch.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !parsed || fromBranchId === toBranchId}>
              {saving ? "Transferring…" : "Record transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
