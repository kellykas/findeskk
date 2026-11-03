import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/shared/FormError";
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
import { staffUpdateSchema, type StaffUpdateInput } from "@/domain/staff";
import type { StaffMember } from "@/services/staff.service";

interface Props {
  staff: StaffMember;
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: StaffUpdateInput) => void;
  onDelete: (userId: string) => void;
}

/**
 * Edits name, status, roles and password, and can delete the account. The
 * database and server functions re-check every rule; this form only explains
 * them.
 */
export function StaffAccessDialog({ staff, open, saving, onOpenChange, onSave, onDelete }: Props) {
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [active, setActive] = useState(staff.active);
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(staff.roles);
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = staffUpdateSchema.safeParse({
      userId: staff.id,
      displayName,
      active,
      roles: selectedRoles,
      password,
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
            <DialogTitle>Edit employee</DialogTitle>
            <DialogDescription>
              {staff.email ?? "Staff account"} · Changes are validated and enforced by the database.
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

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
                Inactive staff cannot sign in or use the ledger.
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

          <div className="space-y-2">
            <Label htmlFor="staff-password">New password</Label>
            <Input
              id="staff-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Leave blank to keep the current password"
              autoComplete="new-password"
            />
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3">
            <div className="text-sm font-medium text-destructive">Delete this account</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Removes the sign-in and its access. Employees who already posted transactions cannot
              be deleted — deactivate them instead.
            </p>
            {confirmDelete ? (
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={saving}
                  onClick={() => onDelete(staff.id)}
                >
                  {saving ? "Deleting…" : "Confirm delete"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep account
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete employee
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
