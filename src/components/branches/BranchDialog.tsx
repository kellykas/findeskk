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
import { Switch } from "@/components/ui/switch";
import { branchFormSchema, type BranchFormInput } from "@/domain/staff";
import type { BranchRecord } from "@/services/staff.service";

interface Props {
  branch?: BranchRecord;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: BranchFormInput) => void;
}

/** Creates a branch, or edits its name, address and active status. */
export function BranchDialog({ branch, open, saving, onOpenChange, onSave }: Props) {
  const [code, setCode] = useState(branch?.code ?? "");
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [active, setActive] = useState(branch?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = branchFormSchema.safeParse({ code, name, address, active });
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
            <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
            <DialogDescription>
              {branch
                ? "Branch codes cannot be changed once the branch exists."
                : "Branch codes appear on receipts and reports, so keep them short and unique."}
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
            <Label htmlFor="branch-code">Code</Label>
            <Input
              id="branch-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={12}
              disabled={Boolean(branch)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch-address">Address</Label>
            <Input
              id="branch-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={160}
              placeholder="Street, area, city"
            />
          </div>

          {branch && (
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Branch active</div>
                <p className="text-xs text-muted-foreground">
                  Inactive branches cannot receive new staff assignments.
                </p>
              </div>
              <Switch checked={active} onCheckedChange={setActive} aria-label="Branch active" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : branch ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
