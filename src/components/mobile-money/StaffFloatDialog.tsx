import { useEffect, useState, type FormEvent } from "react";

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
import { formatMoney, money, toDecimalString } from "@/domain/money";
import {
  parseAmount,
  staffFloatSchema,
  usedFloat,
  type StaffFloatPosition,
} from "@/domain/momoFloat";

export interface StaffFloatValues {
  userId: string;
  network: string;
  currency: string;
  /** Signed decimal in `currency`. */
  amount: string;
  note: string;
}

interface EmployeeOption {
  id: string;
  name: string;
}

interface NetworkOption {
  code: string;
  name: string;
}

interface CurrencyOption {
  code: string;
  name: string;
}

/**
 * Gives one employee part of a network's float, or takes it back. The preview
 * shows where their float stands now and where this entry leaves it, so an
 * allocation is never made blind.
 */
export function StaffFloatDialog({
  employees,
  networks,
  currencies,
  positions,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  employees: EmployeeOption[];
  networks: NetworkOption[];
  currencies: CurrencyOption[];
  /** Every position the reader can see, used for the preview. */
  positions: StaffFloatPosition[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: StaffFloatValues) => void;
}) {
  const [userId, setUserId] = useState(employees[0]?.id ?? "");
  const [network, setNetwork] = useState(networks[0]?.code ?? "");
  const [currency, setCurrency] = useState(currencies[0]?.code ?? "UGX");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The staff list can finish loading after this dialog opens; adopt the first
  // employee rather than leaving the form stuck on an empty selection.
  useEffect(() => {
    const first = employees[0];
    if (!userId && first) setUserId(first.id);
  }, [employees, userId]);

  const current = positions.find(
    (position) =>
      position.userId === userId && position.network === network && position.currency === currency,
  );
  const typed = amount.trim();
  const parsed = typed !== "" && /^-?\d*\.?\d*$/.test(typed) ? parseAmount(typed, currency) : null;
  const after = parsed ? money((current?.remaining.minor ?? 0n) + parsed.minor, currency) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = staffFloatSchema(currency).safeParse({ userId, network, amount, note });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    setError(null);
    onSave({
      userId: result.data.userId,
      network: result.data.network,
      currency,
      amount: toDecimalString(parseAmount(result.data.amount, currency)),
      note: result.data.note,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Give an employee float</DialogTitle>
            <DialogDescription>
              Their deposits are checked against what is left. The money stays in the network&apos;s
              float account, so this records an allocation rather than a ledger entry.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger aria-label="Employee">
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employees.length === 0 && (
              <p className="text-xs text-destructive">
                No active staff to give a float to. Add employees first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Network</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger aria-label="Network">
                  <SelectValue placeholder="Choose a network" />
                </SelectTrigger>
                <SelectContent>
                  {networks.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.code} · {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-float-amount">Amount ({currency})</Label>
            <Input
              id="staff-float-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder={currency === "UGX" ? "2000000" : "100.00"}
              required
            />
            <p className="text-xs text-muted-foreground">
              A negative amount takes float back, for example -50000.
            </p>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Given so far</span>
              <span className="tabular">
                {formatMoney(current?.allocated ?? money(0n, currency))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used</span>
              <span className="tabular">
                {formatMoney(current ? usedFloat(current) : money(0n, currency))}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining now</span>
              <span className="tabular">
                {formatMoney(current?.remaining ?? money(0n, currency))}
              </span>
            </div>
            {after && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining after this</span>
                <span className="tabular font-semibold">{formatMoney(after)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-float-note">Note</Label>
            <Textarea
              id="staff-float-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !userId || !network}>
              {saving ? "Saving…" : "Give float"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
