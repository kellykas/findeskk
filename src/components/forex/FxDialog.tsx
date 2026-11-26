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
import { formatMoney } from "@/domain/money";
import {
  FX_SETTLEMENTS,
  FX_SETTLEMENT_LABELS,
  FX_TYPES,
  FX_TYPE_LABELS,
  formatRate,
  fxAmendmentSchema,
  fxSchema,
  previewTrade,
  rateEffectiveOn,
  tradeRateFor,
  type FxCurrency,
  type FxRate,
  type FxSettlement,
  type FxTradeInput,
  type FxType,
} from "@/domain/forex";
import { todayUtcDate } from "@/domain/date";
import { cn } from "@/lib/utils";
import type { FxRecord } from "@/services/forex.service";

export interface BranchOption {
  id: string;
  code: string;
  name: string;
}

/** What the service needs: the form values plus the rate published for the trade. */
export type FxTradeValues = FxTradeInput & { rate: string; costRate: string };

/** A correction also carries the reason that goes into the audit trail. */
export type FxAmendmentValues = FxTradeValues & { reason: string };

/** Active currencies, in the order the company set. */
export interface FxCurrencyOption {
  code: string;
  name: string;
}

/** Two-decimal form text for an existing trade amount. */
function amountInput(minor: bigint): string {
  const whole = (minor / 100n).toString();
  const fraction = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * Records a trade, or corrects a posted one. A correction is not an in-place
 * edit: the server reverses the original journal entry and posts the corrected
 * trade, so the form explains that and asks for a reason.
 */
export function FxDialog({
  rates,
  currencies,
  branches,
  trade,
  open,
  saving,
  onOpenChange,
  onSave,
  onAmend,
}: {
  rates: FxRate[];
  currencies: FxCurrencyOption[];
  branches: BranchOption[];
  trade?: FxRecord | null;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: FxTradeValues) => void;
  onAmend?: (input: FxAmendmentValues) => void;
}) {
  const editing = Boolean(trade);
  const [type, setType] = useState<FxType>(trade?.type ?? "buy");
  const [currency, setCurrency] = useState<FxCurrency>(trade?.currency ?? "");
  const [foreignAmount, setForeignAmount] = useState(
    trade ? amountInput(trade.foreignAmount.minor) : "1000",
  );
  const [settlement, setSettlement] = useState<FxSettlement>(trade?.settlement ?? "cash");
  const [branchId, setBranchId] = useState(trade?.branchId ?? branches[0]?.id ?? "");
  const [customerRef, setCustomerRef] = useState(trade?.customerRef ?? "");
  const [receiptNo, setReceiptNo] = useState(trade?.receiptNo ?? "");
  const [notes, setNotes] = useState(trade?.notes ?? "");
  const [entryDate, setEntryDate] = useState(trade?.entryDate ?? todayUtcDate());
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A trade is priced from the published rate in force on its own date, so the
  // preview follows the date field rather than always using today's rate.
  const rateForDate = (code: string, date: string) => rateEffectiveOn(rates, code, date);
  const tradeable = currencies.filter((option) => rateForDate(option.code, entryDate));

  // Rates and branches both load asynchronously; adopt the only branch once known.
  useEffect(() => {
    const first = branches[0];
    if (!branchId && first) setBranchId(first.id);
  }, [branches, branchId]);

  useEffect(() => {
    if (!tradeable.some((option) => option.code === currency))
      setCurrency(tradeable[0]?.code ?? "");
  }, [tradeable, currency]);

  const chosenRate = rateForDate(currency, entryDate);
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
      setError(`No rate has been published for ${currency} on or before ${entryDate}.`);
      return;
    }
    const fields = {
      type,
      currency,
      foreignAmount,
      settlement,
      branchId,
      customerRef,
      receiptNo,
      notes,
      entryDate,
    };
    if (editing) {
      const parsed = fxAmendmentSchema.safeParse({ ...fields, reason });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
        return;
      }
      setError(null);
      onAmend?.({
        ...parsed.data,
        rate: tradeRateFor(type, chosenRate),
        costRate: chosenRate.buyRate,
      });
      return;
    }
    const parsed = fxSchema.safeParse(fields);
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
            <DialogTitle>{editing ? "Correct forex trade" : "Record forex trade"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "The original posting is reversed and the corrected trade is posted in its place. The original stays in the ledger for audit."
                : "Trades post against the published rate for the trade date. Rates are published by managers and cannot be edited here."}
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Select value={currency} onValueChange={(value) => setCurrency(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a currency" />
                </SelectTrigger>
                <SelectContent>
                  {tradeable.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.code} · {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tradeable.length === 0 && (
                <p className="text-xs text-destructive">
                  No currency has a published rate on this date. A manager can add one under
                  Currencies &amp; rates.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

          {editing && (
            <div className="space-y-2">
              <Label htmlFor="fx-reason">Reason for the correction</Label>
              <Textarea
                id="fx-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Wrong amount entered"
                required
              />
              <p className="text-xs text-muted-foreground">
                At least 4 characters. Stored with the correction so auditors can see why.
              </p>
            </div>
          )}

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
            ) : chosenRate ? (
              <p className="text-muted-foreground">
                Enter an amount to preview the UGX value at the published rate.
              </p>
            ) : (
              <p className="text-muted-foreground">
                No {currency} rate was published on or before {entryDate}. A rate manager must
                publish one before this trade can be recorded.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !chosenRate || !preview}>
              {saving
                ? editing
                  ? "Correcting…"
                  : "Recording…"
                : editing
                  ? "Save correction"
                  : "Record trade"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
