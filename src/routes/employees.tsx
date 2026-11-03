import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { StaffAccountDialog } from "@/components/employees/StaffAccountDialog";
import { StaffAccessDialog } from "@/components/employees/StaffAccessDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, isStaffAdmin } from "@/domain/access";
import { ROLE_LABELS } from "@/domain/roles";
import type { StaffAccountInput, StaffUpdateInput } from "@/domain/staff";
import { useSession } from "@/hooks/use-session";
import {
  branchesQuery,
  createStaffAccount,
  deleteStaffAccount,
  staffErrorMessage,
  staffQuery,
  updateStaffAccount,
  type StaffMember,
} from "@/services/staff.service";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employees — FinDesk" },
      { name: "description", content: "Staff accounts, roles and access." },
      { property: "og:title", title: "Employees — FinDesk" },
      { property: "og:description", content: "Staff accounts, roles and access." },
    ],
  }),
  component: Employees,
});

function Employees() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "employees.manage"));
  const staff = useQuery({ ...staffQuery, enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [creating, setCreating] = useState(false);
  const [setupIssue, setSetupIssue] = useState<string | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["staff"] });
    void queryClient.invalidateQueries({ queryKey: ["viewer"] });
  }

  /**
   * A missing server key is a deployment problem, not something the user did
   * wrong, so it stays on screen instead of disappearing with the toast.
   */
  function reportError(error: Error) {
    if (/missing supabase environment variable/i.test(error.message)) {
      setSetupIssue(error.message);
      return;
    }
    toast.error(staffErrorMessage(error.message));
  }

  const create = useMutation({
    mutationFn: (input: StaffAccountInput) => createStaffAccount(input),
    onSuccess: (_result, input) => {
      toast.success(`${input.displayName} can now sign in.`);
      setCreating(false);
      refresh();
    },
    onError: (error: Error) => reportError(error),
  });

  const update = useMutation({
    mutationFn: (input: StaffUpdateInput) => updateStaffAccount(input),
    onSuccess: (_result, input) => {
      toast.success(`Account updated for ${input.displayName}.`);
      setEditing(null);
      refresh();
    },
    onError: (error: Error) => reportError(error),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => deleteStaffAccount(userId),
    onSuccess: () => {
      toast.success("Employee account deleted.");
      setEditing(null);
      refresh();
    },
    onError: (error: Error) => reportError(error),
  });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Employees" description="Staff accounts, roles and access." />
        <AccessDenied
          title="Employee management is restricted"
          description="Only a super admin or the company owner can manage employee accounts."
        />
      </AppShell>
    );
  }

  const rows = staff.data ?? [];
  const activeCount = rows.filter((member) => member.active).length;
  const adminCount = rows.filter((member) => isStaffAdmin(member.roles)).length;
  const inactiveCount = rows.length - activeCount;
  const branchName = branches.data?.[0] ? `${branches.data[0].name}` : "Main branch";
  const saving = create.isPending || update.isPending || remove.isPending;

  return (
    <AppShell>
      <PageHeader
        title="Employees"
        description={`Accounts, roles and access. Everyone works in ${branchName}.`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void staff.refetch()}
              disabled={staff.isFetching}
            >
              {staff.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" />
              Add employee
            </Button>
          </>
        }
      />

      {setupIssue && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Employee accounts cannot be changed on this deployment yet.
          </p>
          <p className="mt-1 text-muted-foreground">{setupIssue}</p>
          <p className="mt-1 text-muted-foreground">
            An administrator must add the missing variable in Vercel under Settings → Environment
            Variables, then redeploy. The steps are in docs/ADMIN-SETUP.md.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={String(rows.length)} />
        <StatCard label="Active" value={String(activeCount)} hint="Can sign in" />
        <StatCard label="Administrators" value={String(adminCount)} hint="Super admin or owner" />
        <StatCard label="Inactive" value={String(inactiveCount)} hint="Sign-in blocked" />
      </div>

      <SectionCard title="Staff directory">
        {staff.isPending && (
          <p className="px-5 pb-6 text-sm text-muted-foreground">Loading staff…</p>
        )}

        {staff.isError && (
          <div className="space-y-2 px-5 pb-6 text-sm">
            <p className="text-destructive">Could not load staff: {staff.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void staff.refetch()}
            >
              Try again
            </Button>
          </div>
        )}

        {!staff.isPending && !staff.isError && rows.length === 0 && (
          <p className="px-5 pb-6 text-sm text-muted-foreground">
            No employees yet. Use “Add employee” to create the first account.
          </p>
        )}

        {rows.length > 0 && (
          <DataTable
            rows={rows}
            rowKey={(member) => member.id}
            columns={[
              {
                header: "Employee",
                cell: (member) => (
                  <div className="leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{member.displayName}</span>
                      {member.id === viewer?.userId && (
                        <Badge variant="secondary" className="font-normal">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {member.email ?? "No email"}
                    </div>
                  </div>
                ),
              },
              {
                header: "Roles",
                cell: (member) =>
                  member.roles.length > 0 ? (
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <Badge key={role} variant="outline" className="font-normal">
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <Badge variant="destructive" className="font-normal">
                      No roles
                    </Badge>
                  ),
              },
              {
                header: "Status",
                cell: (member) => (
                  <Badge variant={member.active ? "outline" : "secondary"} className="font-normal">
                    {member.active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              {
                header: "Joined",
                cell: (member) => (
                  <span className="tabular text-xs text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ),
              },
              {
                header: "Access",
                align: "right",
                cell: (member) => (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={member.id === viewer?.userId}
                    title={
                      member.id === viewer?.userId ? "You cannot change your own access" : undefined
                    }
                    onClick={() => setEditing(member)}
                  >
                    Manage
                  </Button>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      {creating && (
        <StaffAccountDialog
          open
          saving={create.isPending}
          onOpenChange={(next) => {
            if (!next) setCreating(false);
          }}
          onSave={(input) => create.mutate(input)}
        />
      )}

      {editing && (
        <StaffAccessDialog
          key={editing.id}
          staff={editing}
          open
          saving={saving}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onSave={(input) => update.mutate(input)}
          onDelete={(userId) => remove.mutate(userId)}
        />
      )}
    </AppShell>
  );
}
