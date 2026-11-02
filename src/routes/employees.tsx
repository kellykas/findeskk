import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { StaffAccessDialog } from "@/components/employees/StaffAccessDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can, isStaffAdmin } from "@/domain/access";
import { ROLE_LABELS } from "@/domain/roles";
import type { StaffAccessInput } from "@/domain/staff";
import { useSession } from "@/hooks/use-session";
import {
  branchesQuery,
  saveStaffAccess,
  staffQuery,
  type StaffMember,
} from "@/services/staff.service";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employees — FinDesk" },
      { name: "description", content: "Staff profiles, roles and branch assignments." },
      { property: "og:title", content: "Employees — FinDesk" },
      { property: "og:description", content: "Staff profiles, roles and branch assignments." },
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

  const save = useMutation({
    mutationFn: (input: StaffAccessInput) => saveStaffAccess(input),
    onSuccess: (_result, input) => {
      toast.success(`Access updated for ${input.displayName}.`);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
      void queryClient.invalidateQueries({ queryKey: ["viewer"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Employees" description="Staff profiles, roles and branch assignments." />
        <AccessDenied
          title="Employee management is restricted"
          description="Only a super admin or the company owner can change staff access."
        />
      </AppShell>
    );
  }

  const rows = staff.data ?? [];
  const activeCount = rows.filter((member) => member.active).length;
  const adminCount = rows.filter((member) => isStaffAdmin(member.roles)).length;
  const unassignedCount = rows.filter((member) => member.branchIds.length === 0).length;
  const branchNames = new Map((branches.data ?? []).map((branch) => [branch.id, branch.name]));

  return (
    <AppShell>
      <PageHeader
        title="Employees"
        description="Staff profiles, roles and branch assignments."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void staff.refetch()}
            disabled={staff.isFetching}
          >
            {staff.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="mb-6 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Staff accounts are created by the company administrator in the authentication provider.
        Roles and branch access are managed here and enforced by the database.
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Staff" value={String(rows.length)} />
        <StatCard label="Active" value={String(activeCount)} />
        <StatCard label="Staff admins" value={String(adminCount)} hint="Super admin or owner" />
        <StatCard label="No branch" value={String(unassignedCount)} hint="Unassigned staff" />
      </div>

      <SectionCard title="Staff directory">
        {staff.isPending && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading staff…</p>
        )}

        {staff.isError && (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="text-destructive">Could not load staff: {staff.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void staff.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!staff.isPending && !staff.isError && rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No staff profiles yet. Create a staff account in the authentication provider, then
            reload this page to assign roles.
          </p>
        )}

        {rows.length > 0 && (
          <DataTable
            rows={rows}
            rowKey={(member) => member.id}
            columns={[
              {
                header: "Staff",
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
                header: "Branches",
                cell: (member) =>
                  member.branchIds.length > 0 ? (
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {member.branchIds.map((branchId) => (
                        <Badge key={branchId} variant="secondary" className="font-normal">
                          {branchNames.get(branchId) ?? "Unknown branch"}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No branch</span>
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
                    disabled={member.id === viewer?.userId}
                    title={
                      member.id === viewer?.userId
                        ? "Administrators cannot change their own access"
                        : undefined
                    }
                    onClick={() => setEditing(member)}
                  >
                    Manage access
                  </Button>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      {editing && (
        <StaffAccessDialog
          key={editing.id}
          staff={editing}
          branches={branches.data ?? []}
          open
          saving={save.isPending}
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onSave={(input) => save.mutate(input)}
        />
      )}
    </AppShell>
  );
}
