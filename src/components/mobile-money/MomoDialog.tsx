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
import { formatMoney } from "@/domain/money";
import { MOMO_TYPES, MOMO_TYPE_LABELS, momoCashMovement, momoSchema } from "@/domain/momo";
import { parseLedgerAmount } from "@/domain/ledger";
import { todayUtcDate } from "@/domain/date";
import type { Money } from "@/domain/money";

const NONE = "__none";

export interface MomoFormValues {
  network: string;
  type: "deposit" | "withdrawal";
  amount: Money;
  commission: Money;
  branchId: string;
  customerId: string | null;
  customerRef: string;
  networkRef: string;
  notes: string;
  entryDate: string;
}

interface BranchOption {
  id: string;
  code: string;
  name: string;
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

interface NetworkOption {
  code: string;
  name: string;
}

interface Props {
  branches: BranchOption[];
  customers: CustomerOption[];
  /** Active networks, in the order the company set. */
  networks: NetworkOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: MomoFormValues) => void;
}

/** Records one manual agency transaction, with a live preview. */
export function MomoDialog({
  branches,
  customers,
  networks,
  open,
  saving,
  onOpenChange,
  onSave,
}: Props) {
  const [network, setNetwork] = useState(networks[0]?.code ?? "");
  const [type, setType] = useState<(typeof MOMO_TYPES)[number]>("deposit");
  const [amount, setAmount] = useState("");
  const [commission, setCommission] = useState("0");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(NONE);
  const [customerRef, setCustomerRef] = useState("");
  const [networkRef, setNetworkRef] = useState("");
  const [notes, setNotes] = useState("");
  const [entryDate, setEntryDate] = useState(todayUtcDate());
  const [error, setError] = useState<string | null>(null);

  // The branch list loads after this dialog mounts; adopt the only branch then.
  useEffect(() => {
    const first = branches[0];
    if (!branchId && first) setBranchId(first.id);
  }, [branches, branchId]);

  // Networks load asynchronously too, and an inactive one may have been removed
  // from the list since this form opened.
  useEffect(() => {
    if (!networks.some((option) => option.code === network)) setNetwork(networks[0]?.code ?? "");
  }, [networks, network]);

  const parsedAmount = parseLedgerAmount(amount);
  const parsedCommission = parseLedgerAmount(commission);
  const showPreview =
    parsedAmount !== null &&
    parsedAmount.minor > 0n &&
    parsedCommission !== null &&
    parsedCommission.minor >= 0n &&
    (type !== "withdrawal" || parsedCommission.minor < parsedAmount.minor);
  const cashMovement = showPreview ? momoCashMovement(type, parsedAmount, parsedCommission) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = momoSchema.safeParse({
      network,
      type,
      amount,
      commission,
      branchId,
      customerId: customerId === NONE ? "" : customerId,
      customerRef,
      networkRef,
      notes,
      entryDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
      return;
    }
    const parsedAmountValue = parseLedgerAmount(parsed.data.amount);
    const parsedCommissionValue = parseLedgerAmount(parsed.data.commission);
    if (!parsedAmountValue || !parsedCommissionValue) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    onSave({
      network: parsed.data.network,
      type: parsed.data.type,
      amount: parsedAmountValue,
      commission: parsedCommissionValue,
      branchId: parsed.data.branchId,
      customerId: parsed.data.customerId === "" ? null : parsed.data.customerId,
      customerRef: parsed.data.customerRef,
      networkRef: parsed.data.networkRef,
      notes: parsed.data.notes,
      entryDate: parsed.data.entryDate,
    });
  }

  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Record mobile money transaction</DialogTitle>
            <DialogDescription>
              Deposits take in cash against float; withdrawals pay out cash against float.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as "deposit" | "withdrawal")}
              >
                <SelectTrigger aria-label="Transaction type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOMO_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MOMO_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              {networks.length === 0 && (
                <p className="text-xs text-destructive">
                  No network is switched on. A manager can add one under Mobile money networks.
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="momo-amount">Amount (UGX)</Label>
              <Input
                id="momo-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="100000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="momo-commission">Commission (UGX)</Label>
              <Input
                id="momo-commission"
                value={commission}
                onChange={(event) => setCommission(event.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger aria-label="Branch">
                <SelectValue placeholder="Select a branch" />
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger aria-label="Customer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Walk-in (no record)</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.code} · {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="momo-customer-ref">Customer reference</Label>
              <Input
                id="momo-customer-ref"
                value={customerRef}
                onChange={(event) => setCustomerRef(event.target.value)}
                maxLength={80}
                placeholder={selectedCustomer ? selectedCustomer.name : "Phone or name"}
                disabled={customerId !== NONE}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="momo-network-ref">Network reference</Label>
              <Input
                id="momo-network-ref"
                value={networkRef}
                onChange={(event) => setNetworkRef(event.target.value)}
                maxLength={40}
                placeholder="As typed on the phone"
              />
              <p className="text-xs text-muted-foreground">
                Entered manually — not verified with the network.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="momo-date">Entry date</Label>
              <Input
                id="momo-date"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
                max={todayUtcDate()}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="momo-notes">Notes</Label>
            <Textarea
              id="momo-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          {showPreview && cashMovement && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {type === "deposit" ? "Cash received" : "Cash paid out"}
                </span>
                <span className="tabular font-medium">{formatMoney(cashMovement)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Float {type === "deposit" ? "pays out" : "receives"}
                </span>
                <span className="tabular font-medium">{formatMoney(parsedAmount)}</span>
              </div>
              {(parsedCommission?.minor ?? 0n) > 0n && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission income</span>
                  <span className="tabular font-medium">{formatMoney(parsedCommission)}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !network}>
              {saving ? "Recording…" : "Record transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
