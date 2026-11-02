import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { BranchDialog } from "@/components/branches/BranchDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/access";
import type { BranchFormInput } from "@/domain/staff";
import { useSession } from "@/hooks/use-session";
import {
  branchesQuery,
  createBranch,
  updateBranch,
  type BranchRecord,
} from "@/services/staff.service";

export const Route = createFileRoute("/branches")({
  head: () => ({
    meta: [
      { title: "Branches — FinDesk" },
      { name: "description", content: "Branch profiles, accounts and performance." },
      { property: "og:title", content: "Branches — FinDesk" },
      { property: "og:description", content: "Branch profiles, accounts and performance." },
    ],
  }),
  component: Branches,
});

function Branches() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "branches.manage"));
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BranchRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const save = useMutation({
    mutationFn: async (input: BranchFormInput) => {
      if (editing) return updateBranch({ id: editing.id, ...input });
      return createBranch({ code: input.code, name: input.name, address: input.address });
    },
    onSuccess: (_result, input) => {
      toast.success(editing ? `${input.name} updated.` : `${input.name} created.`);
      setEditing(null);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["branches"] });
      void queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Branches" description="Branch profiles, accounts and performance." />
        <AccessDenied
          title="Branch management is restricted"
          description="Only a super admin or the company owner can create and edit branches."
        />
      </AppShell>
    );
  }

  const rows = branches.data ?? [];
  const activeCount = rows.filter((branch) => branch.active).length;
  const assignedStaff = rows.reduce((total, branch) => total + branch.staffCount, 0);
  const unstaffedCount = rows.filter((branch) => branch.staffCount === 0).length;
  const dialogOpen = creating || editing !== null;

  function closeDialog() {
    setCreating(false);
    setEditing(null);
  }

  return (
    <AppShell>
      <PageHeader
        title="Branches"
        description="Branch profiles, accounts and performance."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            New branch
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Branches" value={String(rows.length)} />
        <StatCard label="Active" value={String(activeCount)} />
        <StatCard
          label="Staff assignments"
          value={String(assignedStaff)}
          hint="Across all branches"
        />
        <StatCard label="Unstaffed" value={String(unstaffedCount)} hint="No staff assigned" />
      </div>

      <SectionCard
        title="Branch directory"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void branches.refetch()}
            disabled={branches.isFetching}
          >
            {branches.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      >
        {branches.isPending && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading branches…</p>
        )}

        {branches.isError && (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="text-destructive">Could not load branches: {branches.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void branches.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {!branches.isPending && !branches.isError && rows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No branches yet. Create the first branch to start assigning staff.
          </p>
        )}

        {rows.length > 0 && (
          <DataTable
            rows={rows}
            rowKey={(branch) => branch.id}
            columns={[
              {
                header: "Code",
                cell: (branch) => (
                  <span className="tabular text-xs font-medium">{branch.code}</span>
                ),
              },
              {
                header: "Branch",
                cell: (branch) => (
                  <div className="leading-tight">
                    <div className="font-medium">{branch.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {branch.address || "No address recorded"}
                    </div>
                  </div>
                ),
              },
              {
                header: "Staff",
                align: "right",
                cell: (branch) => (
                  <span className="tabular">{branch.staffCount > 0 ? branch.staffCount : "—"}</span>
                ),
              },
              {
                header: "Status",
                cell: (branch) => (
                  <Badge variant={branch.active ? "outline" : "secondary"} className="font-normal">
                    {branch.active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              {
                header: "Created",
                cell: (branch) => (
                  <span className="tabular text-xs text-muted-foreground">
                    {new Date(branch.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                ),
              },
              {
                header: "Manage",
                align: "right",
                cell: (branch) => (
                  <Button variant="outline" size="sm" onClick={() => setEditing(branch)}>
                    Edit
                  </Button>
                ),
              },
            ]}
          />
        )}
      </SectionCard>

      <p className="mt-4 text-xs text-muted-foreground">
        Branches are never deleted: deactivate one instead so historical transactions and staff
        assignments stay intact.
      </p>

      {dialogOpen && (
        <BranchDialog
          key={editing?.id ?? "new-branch"}
          {...(editing ? { branch: editing } : {})}
          open
          saving={save.isPending}
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          onSave={(input) => save.mutate(input)}
        />
      )}
    </AppShell>
  );
}
