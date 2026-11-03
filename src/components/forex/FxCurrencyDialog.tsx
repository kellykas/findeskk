import { useState, type FormEvent } from "react";
import { FormError } from "@/components/shared/FormError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fxCurrencySchema,
  type FxCurrencyForm,
  type FxCurrencyRecord,
} from "@/domain/referenceData";

/**
 * Adds or edits a traded currency. The code is fixed once the currency exists,
 * because published rates and recorded trades store it.
 */
export function FxCurrencyDialog({
  currency,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  /** The currency being edited, or null to add one. */
  currency: FxCurrencyRecord | null;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: FxCurrencyForm) => void;
}) {
  const editing = Boolean(currency);
  const [code, setCode] = useState(currency?.code ?? "");
  const [name, setName] = useState(currency?.name ?? "");
  const [active, setActive] = useState(currency?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(currency?.sortOrder ?? 100));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = fxCurrencySchema.safeParse({ code, name, active, sortOrder });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setError(null);
    onSave(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit currency" : "Add currency"}</DialogTitle>
            <DialogDescription>
              Adding a currency lets you publish its rate and record trades in it. Amounts carry two
              decimals, as the ledger stores them.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency-code">Code</Label>
              <Input
                id="currency-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="AED"
                maxLength={3}
                disabled={editing}
                required
              />
              <p className="text-xs text-muted-foreground">
                {editing
                  ? "The code cannot change: rates and trades use it."
                  : "Three letters, e.g. AED. UGX is the base currency."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency-name">Name</Label>
              <Input
                id="currency-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="UAE Dirham"
                maxLength={40}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency-order">Order on lists</Label>
              <Input
                id="currency-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="100"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="currency-active"
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              <Label htmlFor="currency-active" className="font-normal">
                Available for trading
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save currency" : "Add currency"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
