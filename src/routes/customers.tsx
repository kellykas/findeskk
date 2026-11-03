import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ID_TYPE_LABELS, type CustomerFormInput } from "@/domain/customers";
import { can } from "@/domain/access";
import {
  createCustomer,
  customersQuery,
  updateCustomer,
  type CustomerRecord,
} from "@/services/customers.service";
import { branchesQuery } from "@/services/staff.service";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers — FinDesk" },
      { name: "description", content: "Customer records, identification and history." },
      { property: "og:title", content: "Customers — FinDesk" },
      { property: "og:description", content: "Customer records, identification and history." },
    ],
  }),
  component: Customers,
});

function Customers() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "customers.view"));
  const canManage = Boolean(viewer && can(viewer.roles, "customers.manage"));

  const customers = useQuery({ ...customersQuery, enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [creating, setCreating] = useState(false);

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const branchNames = new Map(branchOptions.map((b) => [b.id, `${b.code} · ${b.name}`]));

  const save = useMutation({
    mutationFn: async (input: CustomerFormInput) => {
      if (editing) await updateCustomer({ ...input, id: editing.id });
      else await createCustomer(input);
    },
    onSuccess: () => {
      toast.success(editing ? "Customer updated." : "Customer created.");
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(null);
      setCreating(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = customers.data ?? [];
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.code, row.name, row.phone, row.email, row.idNumber]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search]);

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Customers" description="Customer records, identification and history." />
        <AccessDenied
          title="Customers are restricted"
          description="Customer records are available to customer-facing roles. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Customers"
        description="Customer records, identification and home branch. Records are deactivated, never deleted."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              New customer
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Customers" value={String(rows.length)} />
        <StatCard label="Active" value={String(rows.filter((row) => row.active).length)} />
        <StatCard
          label="With identification"
          value={String(rows.filter((row) => row.idNumber !== "").length)}
        />
        <StatCard label="Showing" value={String(visibleRows.length)} hint="Matching the search" />
      </div>

      <SectionCard
        title="Customer register"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void customers.refetch()}
            disabled={customers.isFetching}
          >
            {customers.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      >
        <div className="px-4 pt-4">
          <input
            className="mb-3 w-full max-w-sm rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Search by code, name, phone or ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {customers.isPending && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading customers…</p>
        )}
        {customers.isError && (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="text-destructive">Could not load customers: {customers.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void customers.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!customers.isPending && !customers.isError && visibleRows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {search ? "No customers match that search." : "No customers recorded yet."}
          </p>
        )}
        {visibleRows.length > 0 && (
          <DataTable
            rows={visibleRows}
            rowKey={(row) => row.id}
            columns={[
              {
                header: "Code",
                cell: (row) => <span className="tabular text-xs">{row.code}</span>,
              },
              { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
              { header: "Phone", cell: (row) => row.phone || "—" },
              { header: "Email", cell: (row) => row.email || "—" },
              {
                header: "Identification",
                cell: (row) =>
                  row.idNumber ? `${ID_TYPE_LABELS[row.idType]}: ${row.idNumber}` : "—",
              },
              {
                header: "Branch",
                cell: (row) => (row.branchId ? (branchNames.get(row.branchId) ?? "—") : "Any"),
              },
              {
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.active ? "secondary" : "outline"}>
                    {row.active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              ...(canManage
                ? [
                    {
                      header: "",
                      align: "right" as const,
                      cell: (row: CustomerRecord) => (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                          Edit
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </SectionCard>

      {canManage && (
        <CustomerDialog
          key={editing?.id ?? (creating ? "new" : "closed")}
          customer={editing ?? undefined}
          branches={branchOptions}
          open={creating || editing !== null}
          saving={save.isPending}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditing(null);
            }
          }}
          onSave={(input) => save.mutate(input)}
        />
      )}
    </AppShell>
  );
}
