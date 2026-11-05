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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  momoNetworkSchema,
  type MomoNetworkForm,
  type MomoNetworkRecord,
} from "@/domain/referenceData";

export interface FloatAccountOption {
  code: string;
  name: string;
}

/**
 * Adds or edits a mobile money network. The code is fixed once the network
 * exists, because every recorded transaction stores it.
 */
export function MomoNetworkDialog({
  network,
  floatAccounts,
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  /** The network being edited, or null to add one. */
  network: MomoNetworkRecord | null;
  floatAccounts: FloatAccountOption[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: MomoNetworkForm) => void;
}) {
  const editing = Boolean(network);
  const [code, setCode] = useState(network?.code ?? "");
  const [name, setName] = useState(network?.name ?? "");
  // A new network is given its own float account by the database, so only an
  // existing one can be moved to a different active account here.
  const [floatAccountCode, setFloatAccountCode] = useState(network?.floatAccountCode ?? "");
  const [active, setActive] = useState(network?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(network?.sortOrder ?? 100));
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = momoNetworkSchema.safeParse({
      code,
      name,
      floatAccountCode: editing ? floatAccountCode : undefined,
      active,
      sortOrder,
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
            <DialogTitle>{editing ? "Edit network" : "Add network"}</DialogTitle>
            <DialogDescription>
              Each network pays and receives through its own float account, so its balance stays
              separate from the other networks.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="network-code">Code</Label>
              <Input
                id="network-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toLowerCase())}
                placeholder="mpesa"
                maxLength={20}
                disabled={editing}
                required
              />
              <p className="text-xs text-muted-foreground">
                {editing
                  ? "The code cannot change: recorded transactions use it."
                  : "Short lowercase, e.g. mpesa."}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-name">Name</Label>
              <Input
                id="network-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="M-Pesa"
                maxLength={40}
                required
              />
            </div>
          </div>

          {editing ? (
            <div className="space-y-2">
              <Label>Float account</Label>
              <Select value={floatAccountCode} onValueChange={setFloatAccountCode}>
                <SelectTrigger aria-label="Float account">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {floatAccounts.map((account) => (
                    <SelectItem key={account.code} value={account.code}>
                      {account.code} · {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Move this wallet to another active account. Entries already posted stay on the
                account they used.
              </p>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">Its own float account</p>
              <p className="text-xs text-muted-foreground">
                A dedicated asset account is created for this wallet, so its float never mixes with
                the till or another network. You can move it to a different account afterwards.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="network-order">Order on lists</Label>
              <Input
                id="network-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="100"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox
                id="network-active"
                checked={active}
                onCheckedChange={(checked) => setActive(checked === true)}
              />
              <Label htmlFor="network-active" className="font-normal">
                Available for recording
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save network" : "Add network"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
