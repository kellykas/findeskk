import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { MomoDialog, type MomoFormValues } from "@/components/mobile-money/MomoDialog";
import { ReverseMomoDialog } from "@/components/mobile-money/ReverseMomoDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import { MOMO_NETWORK_LABELS, MOMO_TYPE_LABELS, momoCashMovement } from "@/domain/momo";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import {
  momoErrorMessage,
  momoQuery,
  recordMomo,
  reverseMomo,
  type MomoRecord,
} from "@/services/momo.service";
import { branchesQuery } from "@/services/staff.service";
import { customersQuery } from "@/services/customers.service";

export const Route = createFileRoute("/mobile-money")({
  head: () => ({
    meta: [
      { title: "Mobile Money — FinDesk" },
      { name: "description", content: "Record MTN and Airtel agency transactions." },
      { property: "og:title", title: "Mobile Money — FinDesk" },
      { property: "og:description", content: "Record MTN and Airtel agency transactions." },
    ],
  }),
  component: MobileMoney,
});

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function MobileMoney() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "momo.transact"));
  const canReverse = Boolean(viewer && can(viewer.roles, "transactions.reverse"));
  const transactions = useQuery({ ...momoQuery(100), enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const customers = useQuery({ ...customersQuery, enabled: allowed });
  const queryClient = useQueryClient();
  const [recordForm, setRecordForm] = useState(false);
  const [reversing, setReversing] = useState<MomoRecord | null>(null);
  const [search, setSearch] = useState("");

  const saveMomo = useMutation({
    mutationFn: (values: MomoFormValues) =>
      recordMomo({ ...values, idempotencyKey: crypto.randomUUID() }),
    onSuccess: () => {
      toast.success("Transaction recorded and posted to the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["momo"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setRecordForm(false);
    },
    onError: (error: Error) => toast.error(momoErrorMessage(error.message)),
  });

  const reverse = useMutation({
    mutationFn: (input: { momoId: string; reason: string }) => reverseMomo(input),
    onSuccess: () => {
      toast.success("Transaction reversed. The cancelling entry is in the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["momo"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setReversing(null);
    },
    onError: (error: Error) => toast.error(momoErrorMessage(error.message)),
  });

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const customerOptions = useMemo(
    () =>
      (customers.data ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
    [customers.data],
  );
  const customerNames = useMemo(
    () => new Map(customerOptions.map((c) => [c.id, c.name])),
    [customerOptions],
  );

  const rows = useMemo(() => transactions.data ?? [], [transactions.data]);
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const customer = row.customerId ? (customerNames.get(row.customerId) ?? "") : row.customerRef;
      return [
        MOMO_TYPE_LABELS[row.type],
        MOMO_NETWORK_LABELS[row.network],
        row.networkRef,
        customer,
        row.reversal ? "reversed" : "posted",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, search, customerNames]);

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Mobile Money" description="Record MTN and Airtel agency transactions." />
        <AccessDenied
          title="This module is restricted"
          description="Mobile money recording is available to staff with mobile money permissions. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  // Reversed transactions cancel out, so the headline figures count only the
  // ones that still stand. Showing both together would overstate the day.
  const activeRows = rows.filter((row) => !row.reversal);
  const reversedCount = rows.length - activeRows.length;
  const deposits = activeRows.filter((row) => row.type === "deposit");
  const withdrawals = activeRows.filter((row) => row.type === "withdrawal");
  const depositCash = deposits.reduce(
    (total, row) => total + momoCashMovement(row.type, row.amount, row.commission).minor,
    0n,
  );
  const withdrawalCash = withdrawals.reduce(
    (total, row) => total + momoCashMovement(row.type, row.amount, row.commission).minor,
    0n,
  );
  const commission = activeRows.reduce((total, row) => total + row.commission.minor, 0n);

  return (
    <AppShell>
      <PageHeader
        title="Mobile Money"
        description="Record MTN and Airtel agency transactions. Network references are entered by staff, never verified with the network."
        actions={
          <Button size="sm" onClick={() => setRecordForm(true)}>
            Record transaction
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Standing transactions"
          value={String(activeRows.length)}
          hint={
            reversedCount === 0
              ? "Latest 100 records"
              : `Latest 100 records · ${reversedCount} reversed`
          }
        />
        <StatCard
          label="Deposits"
          value={String(deposits.length)}
          hint={`${formatMoney(money(depositCash, BASE_CURRENCY))} cash in`}
        />
        <StatCard
          label="Withdrawals"
          value={String(withdrawals.length)}
          hint={`${formatMoney(money(withdrawalCash, BASE_CURRENCY))} cash out`}
        />
        <StatCard label="Commission" value={formatMoney(money(commission, BASE_CURRENCY))} />
      </div>

      <SectionCard
        title="Mobile money transactions"
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void transactions.refetch()}
            disabled={transactions.isFetching}
          >
            {transactions.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      >
        <div className="px-4 pt-4">
          <input
            className="mb-3 w-full max-w-xs rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            placeholder="Search by type, network, customer or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {transactions.isPending && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading transactions…</p>
        )}
        {transactions.isError && (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="text-destructive">
              Could not load transactions: {transactions.error.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => void transactions.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!transactions.isPending && !transactions.isError && visibleRows.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {search ? "No transactions match that search." : "No transactions recorded yet."}
          </p>
        )}
        {visibleRows.length > 0 && (
          <DataTable
            rows={visibleRows}
            rowKey={(row) => row.id}
            columns={[
              { header: "Date", cell: (row) => day(row.entryDate) },
              {
                header: "Transaction",
                cell: (row) => (
                  <span className="font-medium">
                    {MOMO_TYPE_LABELS[row.type]} · {MOMO_NETWORK_LABELS[row.network]}
                  </span>
                ),
              },
              { header: "Amount", align: "right", cell: (row) => formatMoney(row.amount) },
              { header: "Commission", align: "right", cell: (row) => formatMoney(row.commission) },
              {
                header: "Cash movement",
                align: "right",
                cell: (row) => formatMoney(momoCashMovement(row.type, row.amount, row.commission)),
              },
              {
                header: "Customer",
                cell: (row) =>
                  (row.customerId ? customerNames.get(row.customerId) : row.customerRef) ??
                  "Walk-in",
              },
              {
                header: "Network ref",
                cell: (row) => (
                  <span className="text-xs text-muted-foreground">{row.networkRef || "—"}</span>
                ),
              },
              {
                header: "Status",
                cell: (row) =>
                  row.reversal ? (
                    <Badge
                      variant="secondary"
                      className="font-normal"
                      title={`Reversed ${new Date(row.reversal.reversedAt).toLocaleDateString("en-GB")}: ${row.reversal.reason}`}
                    >
                      Reversed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal">
                      Posted
                    </Badge>
                  ),
              },
              ...(canReverse
                ? [
                    {
                      header: "",
                      align: "right" as const,
                      cell: (row: MomoRecord) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(row.reversal) || reverse.isPending}
                          title={
                            row.reversal
                              ? `Already reversed: ${row.reversal.reason}`
                              : "Post a cancelling entry for this transaction"
                          }
                          onClick={() => setReversing(row)}
                        >
                          Reverse
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </SectionCard>

      <p className="mt-4 text-xs text-muted-foreground">
        Every recording posts a balanced journal entry, so these figures always agree with the
        ledger. A reversal never deletes anything: it posts the mirror image of the original entry
        and keeps both for audit.
      </p>

      {/* Mounted only while open, so the form always starts blank. */}
      {recordForm && (
        <MomoDialog
          branches={branchOptions}
          customers={customerOptions}
          open
          saving={saveMomo.isPending}
          onOpenChange={setRecordForm}
          onSave={(values) => saveMomo.mutate(values)}
        />
      )}

      {reversing && (
        <ReverseMomoDialog
          transaction={reversing}
          open
          saving={reverse.isPending}
          onOpenChange={(next) => {
            if (!next) setReversing(null);
          }}
          onConfirm={(reason) => reverse.mutate({ momoId: reversing.id, reason })}
        />
      )}
    </AppShell>
  );
}
