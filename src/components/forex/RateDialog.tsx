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
import {
  FX_CURRENCIES,
  FX_CURRENCY_LABELS,
  fxRateSchema,
  type FxCurrency,
  type FxRateInput,
} from "@/domain/forex";
import { todayUtcDate } from "@/domain/date";

export function RateDialog({
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: FxRateInput) => void;
}) {
  const [currency, setCurrency] = useState<FxCurrency>("USD");
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayUtcDate());
  const [error, setError] = useState<string | null>(null);

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = fxRateSchema.safeParse({ currency, buyRate, sellRate, effectiveFrom });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the rates and try again.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Publish exchange rate</DialogTitle>
            <DialogDescription>
              Rates are append-only history: publishing adds a new rate from the effective date.
              Trades recorded afterwards must use it.
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rate-buy">Buy rate (UGX)</Label>
              <Input
                id="rate-buy"
                value={buyRate}
                onChange={(event) => setBuyRate(event.target.value.replace(/,/g, ""))}
                inputMode="decimal"
                placeholder="3700"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate-sell">Sell rate (UGX)</Label>
              <Input
                id="rate-sell"
                value={sellRate}
                onChange={(event) => setSellRate(event.target.value.replace(/,/g, ""))}
                inputMode="decimal"
                placeholder="3760"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate-date">Effective from</Label>
            <Input
              id="rate-date"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Publishing…" : "Publish rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
