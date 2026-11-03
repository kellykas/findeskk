import { useState, type FormEvent } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ID_TYPES,
  ID_TYPE_LABELS,
  customerFormSchema,
  type CustomerFormInput,
} from "@/domain/customers";
import type { CustomerRecord } from "@/services/customers.service";

const NONE = "__none";

interface BranchOption {
  id: string;
  code: string;
  name: string;
}

interface Props {
  customer?: CustomerRecord | undefined;
  branches: BranchOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: CustomerFormInput) => void;
}

/** Creates a customer, or edits their details, home branch and status. */
export function CustomerDialog({ customer, branches, open, saving, onOpenChange, onSave }: Props) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [idType, setIdType] = useState(customer?.idType || NONE);
  const [idNumber, setIdNumber] = useState(customer?.idNumber ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [branchId, setBranchId] = useState(customer?.branchId ?? NONE);
  const [active, setActive] = useState(customer?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = customerFormSchema.safeParse({
      name,
      phone,
      email,
      idType: idType === NONE ? "" : idType,
      idNumber,
      notes,
      branchId: branchId === NONE ? "" : branchId,
      active,
    });
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
            <DialogTitle>{customer ? "Edit customer" : "New customer"}</DialogTitle>
            <DialogDescription>
              {customer
                ? `${customer.code} · records are deactivated, never deleted.`
                : "A customer code is assigned automatically."}
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
            <Label htmlFor="customer-name">Name</Label>
            <Input
              id="customer-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input
                id="customer-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={20}
                placeholder="+256 7.."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">Email</Label>
              <Input
                id="customer-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={120}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Identification</Label>
              <Select value={idType} onValueChange={setIdType}>
                <SelectTrigger aria-label="Identification type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
                  {ID_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {ID_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-id-number">ID number</Label>
              <Input
                id="customer-id-number"
                value={idNumber}
                onChange={(event) => setIdNumber(event.target.value)}
                maxLength={40}
                disabled={idType === NONE}
                placeholder={idType === NONE ? "Select a type first" : ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Home branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger aria-label="Home branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No home branch</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea
              id="customer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Optional"
            />
          </div>

          {customer && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Customer active</div>
                <p className="text-xs text-muted-foreground">
                  Inactive customers stay on record for history.
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Customer active" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : customer ? "Save changes" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
