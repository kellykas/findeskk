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
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { staffAccountSchema, type StaffAccountInput } from "@/domain/staff";

interface Props {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: StaffAccountInput) => void;
}

/** Creates a new employee sign-in. Only staff admins can open this. */
export function StaffAccountDialog({ open, saving, onOpenChange, onSave }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(["forex_teller"]);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: Role) {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = staffAccountSchema.safeParse({
      displayName,
      email,
      password,
      roles: selectedRoles,
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
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Creates a sign-in the employee can use straight away. Share the password with them and
              ask them to change it after signing in.
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
            <Label htmlFor="account-name">Full name</Label>
            <Input
              id="account-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              placeholder="Adaline Nakato"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-email">Email</Label>
            <Input
              id="account-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="adaline@company.co.ug"
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-password">Temporary password</Label>
            <Input
              id="account-password"
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Roles</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <Checkbox
                    id={`new-role-${role}`}
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <Label htmlFor={`new-role-${role}`} className="text-sm font-normal">
                    {ROLE_LABELS[role]}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
