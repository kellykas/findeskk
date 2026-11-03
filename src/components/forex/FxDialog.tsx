import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatMoney } from "@/domain/money";
import {
  FX_CURRENCIES,
  FX_CURRENCY_LABELS,
  FX_SETTLEMENTS,
  FX_SETTLEMENT_LABELS,
  FX_TYPES,
  FX_TYPE_LABELS,
  formatRate,
  fxSchema,
  previewTrade,
  tradeRateFor,
  type FxCurrency,
  type FxRate,
  type FxSettlement,
  type FxTradeInput,
  type FxType,
} from "@/domain/forex";
import { todayUtcDate } from "@/domain/date";
import { cn } from "@/lib/utils";

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

/** What the service needs: the form values plus the rate published for the trade. */
export type FxTradeValues = FxTradeInput & { rate: string; costRate: string };

export function FxDialog({
  latestRates,
  branches,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  latestRates: FxRate[];
  branches: BranchOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: FxTradeValues) => void;
}) {
  const [type, setType] = useState<FxType>("buy");
  const [currency, setCurrency] = useState<FxCurrency>("USD");
  const [foreignAmount, setForeignAmount] = useState("1000");
  const [settlement, setSettlement] = useState<FxSettlement>("cash");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [customerRef, setCustomerRef] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(todayUtcDate());
  const [error, setError] = useState<string | null>(null);

  const chosenRate = latestRates.find((rate) => rate.currency === currency);
  const preview = chosenRate
    ? previewTrade({
        type,
        foreignAmount,
        buyRate: chosenRate.buyRate,
        sellRate: chosenRate.sellRate,
      })
    : null;

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chosenRate) {
      setError(`No rate has been published for ${currency} yet.`);
      return;
    }
    const parsed = fxSchema.safeParse({
      type,
      currency,
      foreignAmount,
      settlement,
      branchId,
      customerRef,
      receiptNo,
      notes,
      entryDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setError(null);
    onSave({
      ...parsed.data,
      rate: tradeRateFor(type, chosenRate),
      costRate: chosenRate.buyRate,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record forex trade</DialogTitle>
            <DialogDescription>
              Trades post against the latest published rate for the currency. Rates are published by
              managers and cannot be edited here.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Trade</Label>
              <Select value={type} onValueChange={(value) => setType(value as FxType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FX_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(value) => setCurrency(value as FxCurrency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FX_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} · {FX_CURRENCY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fx-amount">Foreign amount</Label>
              <Input
                id="fx-amount"
                value={foreignAmount}
                onChange={(event) => setForeignAmount(event.target.value.replace(/,/g, ""))}
                inputMode="decimal"
                placeholder="1000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Settlement</Label>
              <Select
                value={settlement}
                onValueChange={(value) => setSettlement(value as FxSettlement)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FX_SETTLEMENTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {FX_SETTLEMENT_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-md border bg-muted/40 px-3 py-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Buy rate</span>
              <span className="tabular font-medium">{formatRate(chosenRate?.buyRate ?? "—")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sell rate</span>
              <span className="tabular font-medium">{formatRate(chosenRate?.sellRate ?? "—")}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fx-customer-ref">Customer reference</Label>
              <Input
                id="fx-customer-ref"
                value={customerRef}
                onChange={(event) => setCustomerRef(event.target.value)}
                maxLength={80}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fx-receipt">Receipt number</Label>
              <Input
                id="fx-receipt"
                value={receiptNo}
                onChange={(event) => setReceiptNo(event.target.value)}
                maxLength={40}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fx-date">Entry date</Label>
            <Input
              id="fx-date"
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
              max={todayUtcDate()}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fx-notes">Notes</Label>
            <Textarea
              id="fx-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {preview ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    UGX {type === "buy" ? "paid out" : "received"}
                  </span>
                  <span className="tabular font-medium">{formatMoney(preview.ugx)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost of foreign currency</span>
                  <span className="tabular font-medium">{formatMoney(preview.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin</span>
                  <span
                    className={cn(
                      "tabular font-medium",
                      preview.margin.minor < 0n && "text-destructive",
                    )}
                  >
                    {formatMoney(preview.margin)}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">
                Enter an amount to preview the UGX value at the published rate.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !chosenRate || !preview}>
              {saving ? "Recording…" : "Record trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
