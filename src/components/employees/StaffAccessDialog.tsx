import { useState, type FormEvent } from "react";
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
import { Switch } from "@/components/ui/switch";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { staffAccessSchema, type StaffAccessInput } from "@/domain/staff";
import type { BranchRecord, StaffMember } from "@/services/staff.service";

interface Props {
  staff: StaffMember;
  branches: BranchRecord[];
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: StaffAccessInput) => void;
}

/** Edits a staff member's name, status, roles and branch assignments. */
export function StaffAccessDialog({ staff, branches, open, saving, onOpenChange, onSave }: Props) {
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [active, setActive] = useState(staff.active);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(staff.roles);
  const [branchIds, setBranchIds] = useState<string[]>(staff.branchIds);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  function toggleBranch(branchId: string) {
    setBranchIds((current) =>
      current.includes(branchId)
        ? current.filter((item) => item !== branchId)
        : [...current, branchId],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = staffAccessSchema.safeParse({
      userId: staff.id,
      displayName,
      active,
      roles: selectedRoles,
      branchIds,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Manage staff access</DialogTitle>
            <DialogDescription>
              {staff.email ?? "Staff account"} · Changes are validated and enforced by the database.
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
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Account active</div>
              <p className="text-xs text-muted-foreground">
                Inactive staff cannot sign in or use assigned branches.
              </p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} aria-label="Account active" />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Roles</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`role-${role}`}
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <Label htmlFor={`role-${role}`} className="text-sm font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Branches</legend>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No branches exist yet. Create a branch before assigning staff.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {branches.map((branch) => {
                  const selectable = branch.active || branchIds.includes(branch.id);
                  return (
                    <div key={branch.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`branch-${branch.id}`}
                        checked={branchIds.includes(branch.id)}
                        disabled={!selectable}
                        onCheckedChange={() => toggleBranch(branch.id)}
                      />
                      <Label htmlFor={`branch-${branch.id}`} className="text-sm font-normal">
                        {branch.name}
                        <span className="ml-1 font-mono text-xs text-muted-foreground">
                          {branch.code}
                        </span>
                        {!branch.active && (
                          <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
