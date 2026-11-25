import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { MomoDialog, type MomoFormValues } from "@/components/mobile-money/MomoDialog";
import {
  MomoReceiptDialog,
  type MomoReceiptData,
} from "@/components/mobile-money/MomoReceiptDialog";
import { MomoNetworkDialog } from "@/components/mobile-money/MomoNetworkDialog";
import { StaffFloatDialog } from "@/components/mobile-money/StaffFloatDialog";
import { ReverseMomoDialog } from "@/components/mobile-money/ReverseMomoDialog";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  SectionCard,
  SetupNotice,
  StatCard,
} from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, money, type Money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import { foreignValueOfUgx } from "@/domain/forex";
import {
  MOMO_TYPE_LABELS,
  momoCashMovement,
  momoForeignAmounts,
  momoNetworkLabel,
} from "@/domain/momo";
import { isSetupMissing } from "@/domain/referenceDataMessages";
import {
  activeCurrencies,
  activeNetworks,
  type MomoNetworkForm,
  type MomoNetworkRecord,
} from "@/domain/referenceData";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import {
  correctMomo,
  momoErrorMessage,
  momoQuery,
  recordMomo,
  reverseMomo,
  type MomoRecord,
} from "@/services/momo.service";
import {
  deleteMomoNetwork,
  floatAccountsQuery,
  momoNetworksQuery,
  saveMomoNetwork,
} from "@/services/referenceData.service";
import { fxRatesQuery, latestRates } from "@/services/forex.service";
import { fxCurrenciesQuery, momoCurrencyFloatsQuery } from "@/services/referenceData.service";
import { accountBalancesQuery } from "@/services/ledger.service";
import { allocateStaffFloat, staffFloatPositionsQuery } from "@/services/momoFloat.service";
import { usedFloat } from "@/domain/momoFloat";
import { branchesQuery, staffQuery } from "@/services/staff.service";
import { customersQuery } from "@/services/customers.service";
import { settingsQuery } from "@/services/settings.service";

export const Route = createFileRoute("/mobile-money")({
  head: () => ({
    meta: [
      { title: "Mobile Money — FinDesk" },
      { name: "description", content: "Record mobile money agency deposits and withdrawals." },
      { property: "og:title", title: "Mobile Money — FinDesk" },
      {
        property: "og:description",
        content: "Record mobile money agency deposits and withdrawals.",
      },
    ],
  }),
  component: MobileMoney,
});

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/**
 * The networks every company had before networks became manageable. Used only
 * when the reference-data setup has not been run yet, so recording keeps working.
 */
const FALLBACK_NETWORKS = [
  { code: "mtn", name: "MTN Mobile Money" },
  { code: "airtel", name: "Airtel Money" },
];

/** The row's amounts in the currency the customer paid, or null for UGX. */
function foreignAmountsFor(row: MomoRecord) {
  if (row.currency === BASE_CURRENCY || !row.rate) return null;
  return momoForeignAmounts({
    type: row.type,
    amount: row.amount,
    commission: row.commission,
    currency: row.currency,
    rate: row.rate,
  });
}

/** One wallet float's balance, in its own currency and in the UGX ledger. */
interface FloatBalanceRow {
  accountCode: string;
  currency: string;
  /** The balance in the float's own currency. */
  amount: Money;
  /** The ledger's UGX value, when `amount` is a foreign currency. */
  ledger: Money | null;
}

/** A recorded transaction's values, used to open it for correction. */
function formValuesFor(row: MomoRecord): MomoFormValues {
  return {
    network: row.network,
    type: row.type,
    currency: row.currency,
    foreignAmount: row.foreignAmount,
    rate: row.rate,
    amount: row.amount,
    commission: row.commission,
    branchId: row.branchId,
    customerId: row.customerId,
    customerRef: row.customerRef,
    networkRef: row.networkRef,
    notes: row.notes,
    entryDate: row.entryDate,
  };
}

/** The customer's currency first; the UGX ledger value stays visible beside it. */
function AmountCell({ ugx, foreign }: { ugx: Money; foreign?: Money | null | undefined }) {
  return (
    <span className="tabular">
      {formatMoney(foreign ?? ugx)}
      {foreign && <span className="ml-1 text-xs text-muted-foreground">{formatMoney(ugx)}</span>}
    </span>
  );
}

function MobileMoney() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "momo.transact"));
  const canReverse = Boolean(viewer && can(viewer.roles, "transactions.reverse"));
  // Corrections reverse the original and repost it, so they are narrower than
  // reversing alone: only a super admin or company owner holds this permission.
  const canCorrect = Boolean(viewer && can(viewer.roles, "transactions.correct"));
  const canManageNetworks = Boolean(viewer && can(viewer.roles, "reference.manage"));
  // Giving float is an owner decision, like correcting a posted transaction.
  const canAllocate = Boolean(viewer && can(viewer.roles, "floats.allocate"));
  const transactions = useQuery({ ...momoQuery(100), enabled: allowed });
  const networks = useQuery({ ...momoNetworksQuery, enabled: allowed });
  const floatAccounts = useQuery({ ...floatAccountsQuery, enabled: canManageNetworks });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const customers = useQuery({ ...customersQuery, enabled: allowed });
  const settings = useQuery({ ...settingsQuery, enabled: allowed });
  const fxRates = useQuery({ ...fxRatesQuery, enabled: allowed });
  const fxCurrencies = useQuery({ ...fxCurrenciesQuery, enabled: allowed });
  const currencyFloats = useQuery({ ...momoCurrencyFloatsQuery, enabled: canManageNetworks });
  const balances = useQuery({ ...accountBalancesQuery, enabled: canManageNetworks });
  // Everyone sees their own float; an administrator sees every employee's.
  const floatPositions = useQuery({ ...staffFloatPositionsQuery, enabled: allowed });
  const staff = useQuery({ ...staffQuery, enabled: canAllocate });
  const queryClient = useQueryClient();
  const [recordForm, setRecordForm] = useState(false);
  const [reversing, setReversing] = useState<MomoRecord | null>(null);
  const [correcting, setCorrecting] = useState<MomoRecord | null>(null);
  const [floatForm, setFloatForm] = useState(false);
  const [networkForm, setNetworkForm] = useState<{ network: MomoNetworkRecord | null } | null>(
    null,
  );
  const [receipt, setReceipt] = useState<MomoReceiptData | null>(null);
  const [search, setSearch] = useState("");

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const branchNames = useMemo(
    () => new Map(branchOptions.map((b) => [b.id, `${b.code} · ${b.name}`])),
    [branchOptions],
  );
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

  const staffOptions = useMemo(
    () =>
      (staff.data ?? [])
        .filter((member) => member.active)
        .map((member) => ({ id: member.id, name: member.displayName })),
    [staff.data],
  );
  const staffNames = useMemo(
    () => new Map(staffOptions.map((member) => [member.id, member.name])),
    [staffOptions],
  );
  const floatCurrencies = useMemo(
    () => [
      { code: BASE_CURRENCY, name: "Ugandan Shilling" },
      ...activeCurrencies(fxCurrencies.data ?? []).map((currency) => ({
        code: currency.code,
        name: currency.name,
      })),
    ],
    [fxCurrencies.data],
  );
  const myFloats = useMemo(
    () => (floatPositions.data ?? []).filter((position) => position.userId === viewer?.userId),
    [floatPositions.data, viewer?.userId],
  );
  const floatRows = useMemo(
    () =>
      [...(floatPositions.data ?? [])].sort(
        (a, b) =>
          (staffNames.get(a.userId) ?? "").localeCompare(staffNames.get(b.userId) ?? "") ||
          a.network.localeCompare(b.network) ||
          a.currency.localeCompare(b.currency),
      ),
    [floatPositions.data, staffNames],
  );

  /** The receipt for a just-saved transaction, whether recorded or corrected. */
  const receiptFrom = (id: string, values: MomoFormValues): MomoReceiptData => ({
    id,
    branchId: values.branchId,
    network: values.network,
    type: values.type,
    amount: values.amount,
    commission: values.commission,
    currency: values.currency,
    rate: values.rate,
    entryDate: values.entryDate,
    customer:
      (values.customerId ? customerNames.get(values.customerId) : values.customerRef) || "Walk-in",
    networkRef: values.networkRef,
    notes: values.notes,
  });

  // Networks are company-managed rows, so names come from the table; the built-in
  // MTN/Airtel labels are only a fallback for a row that is not loaded.
  const networkNames = useMemo(
    () => new Map((networks.data ?? []).map((network) => [network.code, network.name])),
    [networks.data],
  );
  const networkOptions = useMemo(() => {
    const managed = activeNetworks(networks.data ?? []).map((network) => ({
      code: network.code,
      name: network.name,
    }));
    if (managed.length > 0) return managed;
    return networks.isError ? FALLBACK_NETWORKS : [];
  }, [networks.data, networks.isError]);
  // Only currencies with a published rate can price a commission; the base
  // currency is never offered here because UGX has its own unit.
  const foreignRateOptions = useMemo(() => {
    const names = new Map(activeCurrencies(fxCurrencies.data ?? []).map((c) => [c.code, c.name]));
    return latestRates(fxRates.data ?? [])
      .filter((rate) => rate.currency !== BASE_CURRENCY && names.has(rate.currency))
      .map((rate) => ({
        code: rate.currency,
        name: names.get(rate.currency) ?? rate.currency,
        buyRate: rate.buyRate,
      }));
  }, [fxRates.data, fxCurrencies.data]);
  const accountNames = useMemo(
    () =>
      new Map(
        (floatAccounts.data ?? []).map((account) => [
          account.code,
          `${account.code} · ${account.name}`,
        ]),
      ),
    [floatAccounts.data],
  );

  // A network holds one float per currency. The ledger values every float in
  // UGX, so a foreign float is shown back in its own currency at today's buy
  // rate, with the UGX ledger value kept beside it.
  const buyRateByCurrency = useMemo(() => {
    const rates = new Map<string, string>();
    for (const rate of latestRates(fxRates.data ?? [])) rates.set(rate.currency, rate.buyRate);
    return rates;
  }, [fxRates.data]);

  const floatBalances = useMemo(() => {
    const balancesByCode = new Map(
      (balances.data ?? []).map((account) => [account.code, account.balance]),
    );
    const byNetwork = new Map<string, FloatBalanceRow[]>();
    const add = (network: string, accountCode: string, currency: string) => {
      const ledger = balancesByCode.get(accountCode);
      if (!ledger) return;
      const rate = buyRateByCurrency.get(currency);
      const foreign =
        currency === BASE_CURRENCY || !rate ? null : foreignValueOfUgx(ledger, rate, currency);
      const rows = byNetwork.get(network) ?? [];
      rows.push({
        accountCode,
        currency,
        amount: foreign ?? ledger,
        ledger: foreign ? ledger : null,
      });
      byNetwork.set(network, rows);
    };
    for (const network of networks.data ?? []) {
      add(network.code, network.floatAccountCode, BASE_CURRENCY);
    }
    for (const float of currencyFloats.data ?? []) {
      add(float.network, float.floatAccountCode, float.currency);
    }
    // UGX first, then the foreign wallets in code order.
    for (const rows of byNetwork.values()) {
      rows.sort((a, b) => {
        if (a.currency === BASE_CURRENCY) return -1;
        if (b.currency === BASE_CURRENCY) return 1;
        return a.currency.localeCompare(b.currency);
      });
    }
    return byNetwork;
  }, [balances.data, networks.data, currencyFloats.data, buyRateByCurrency]);

  const saveMomo = useMutation({
    mutationFn: (values: MomoFormValues) =>
      recordMomo({ ...values, idempotencyKey: crypto.randomUUID() }),
    onSuccess: (id, values) => {
      toast.success("Transaction recorded and posted to the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["momo"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setRecordForm(false);
      // Receipts are optional: offer one, and the teller can close it.
      setReceipt(receiptFrom(id, values));
    },
    onError: (error: Error) => toast.error(momoErrorMessage(error.message)),
  });

  const allocateFloat = useMutation({
    mutationFn: (values: {
      userId: string;
      network: string;
      currency: string;
      amount: string;
      note: string;
    }) => allocateStaffFloat(values),
    onSuccess: () => {
      toast.success("Float allocated. That employee's deposits are checked against it.");
      void queryClient.invalidateQueries({ queryKey: ["momo"] });
      setFloatForm(false);
    },
    // The service already turns database errors into readable sentences.
    onError: (error: Error) => toast.error(error.message),
  });

  const correct = useMutation({
    mutationFn: (input: { momoId: string; values: MomoFormValues; reason: string }) =>
      correctMomo({
        ...input.values,
        momoId: input.momoId,
        reason: input.reason,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (id, input) => {
      toast.success(
        "Correction posted. The original was reversed and the corrected entry recorded.",
      );
      void queryClient.invalidateQueries({ queryKey: ["momo"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setCorrecting(null);
      setReceipt(receiptFrom(id, input.values));
    },
    onError: (error: Error) => toast.error(momoErrorMessage(error.message)),
  });

  const saveNetwork = useMutation({
    mutationFn: (values: MomoNetworkForm) => saveMomoNetwork(values),
    onSuccess: () => {
      toast.success("Network saved.");
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
      setNetworkForm(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeNetwork = useMutation({
    mutationFn: (code: string) => deleteMomoNetwork(code),
    onSuccess: () => {
      toast.success("Network deleted.");
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
    },
    onError: (error: Error) => toast.error(error.message),
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

  const rows = useMemo(() => transactions.data ?? [], [transactions.data]);
  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const customer = row.customerId ? (customerNames.get(row.customerId) ?? "") : row.customerRef;
      return [
        MOMO_TYPE_LABELS[row.type],
        networkNames.get(row.network) ?? momoNetworkLabel(row.network),
        row.networkRef,
        customer,
        row.reversal ? "reversed" : "posted",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, search, customerNames, networkNames]);

  function receiptFor(row: MomoRecord): MomoReceiptData {
    return {
      id: row.id,
      branchId: row.branchId,
      network: row.network,
      type: row.type,
      amount: row.amount,
      commission: row.commission,
      currency: row.currency,
      rate: row.rate,
      entryDate: row.entryDate,
      customer: (row.customerId ? customerNames.get(row.customerId) : row.customerRef) || "Walk-in",
      networkRef: row.networkRef,
      notes: row.notes,
    };
  }

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title={t("Mobile Money")}
          description={t("Record mobile money agency deposits and withdrawals.")}
        />
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
        title={t("Mobile Money")}
        description={t(
          "Record agency deposits and withdrawals. Network references are entered by staff, never verified with the network.",
        )}
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
                    {MOMO_TYPE_LABELS[row.type]} ·{" "}
                    {networkNames.get(row.network) ?? momoNetworkLabel(row.network)}
                  </span>
                ),
              },
              {
                header: "Amount",
                align: "right",
                cell: (row) => (
                  <AmountCell ugx={row.amount} foreign={foreignAmountsFor(row)?.amount} />
                ),
              },
              {
                header: "Commission",
                align: "right",
                cell: (row) => (
                  <AmountCell ugx={row.commission} foreign={foreignAmountsFor(row)?.commission} />
                ),
              },
              {
                header: "Cash movement",
                align: "right",
                cell: (row) => (
                  <AmountCell
                    ugx={momoCashMovement(row.type, row.amount, row.commission)}
                    foreign={foreignAmountsFor(row)?.cash}
                  />
                ),
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
              {
                header: "",
                align: "right",
                cell: (row) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Show the customer receipt"
                    onClick={() => setReceipt(receiptFor(row))}
                  >
                    Receipt
                  </Button>
                ),
              },
              ...(canCorrect
                ? [
                    {
                      header: "",
                      align: "right" as const,
                      cell: (row: MomoRecord) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(row.reversal) || correct.isPending}
                          title={
                            row.reversal
                              ? `Already reversed: ${row.reversal.reason}`
                              : "Correct this transaction: the original is reversed and a corrected entry is posted"
                          }
                          onClick={() => setCorrecting(row)}
                        >
                          Edit
                        </Button>
                      ),
                    },
                  ]
                : []),
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

      {myFloats.length > 0 && (
        <div className="mt-6">
          <SectionCard title="Your float">
            <p className="px-5 pb-3 text-sm text-muted-foreground">
              What you can still pay out on each wallet. Deposits reduce it; withdrawals add back.
            </p>
            <DataTable
              rows={myFloats}
              rowKey={(position) => `${position.userId}|${position.network}|${position.currency}`}
              columns={[
                {
                  header: "Network",
                  cell: (position) =>
                    networkNames.get(position.network) ?? momoNetworkLabel(position.network),
                },
                { header: "Currency", cell: (position) => position.currency },
                {
                  header: "Given",
                  align: "right",
                  cell: (position) => formatMoney(position.allocated),
                },
                {
                  header: "Used",
                  align: "right",
                  cell: (position) => formatMoney(usedFloat(position)),
                },
                {
                  header: "Remaining",
                  align: "right",
                  cell: (position) => (
                    <span className="font-semibold">{formatMoney(position.remaining)}</span>
                  ),
                },
              ]}
            />
          </SectionCard>
        </div>
      )}

      {canAllocate && (
        <div className="mt-6">
          <SectionCard
            title="Employee floats"
            action={
              <Button variant="outline" size="sm" onClick={() => setFloatForm(true)}>
                Give float
              </Button>
            }
          >
            <p className="px-5 pb-3 text-sm text-muted-foreground">
              Give a teller part of a network&apos;s float. Their deposits are checked against what
              is left; the money stays in the network&apos;s own float account.
            </p>
            {floatPositions.isPending && (
              <p className="px-5 py-6 text-sm text-muted-foreground">Loading floats…</p>
            )}
            {floatPositions.isError &&
              (isSetupMissing(floatPositions.error.message) ? (
                <SetupNotice file="supabase/migrations/20261117140000_momo_staff_floats.sql">
                  <p className="text-muted-foreground">
                    Employee floats are not enabled in the database yet. Recording keeps working
                    until then.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void floatPositions.refetch()}>
                    Try again
                  </Button>
                </SetupNotice>
              ) : (
                <div className="space-y-2 px-5 py-6 text-sm">
                  <p className="text-destructive">
                    Could not load employee floats: {floatPositions.error.message}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void floatPositions.refetch()}>
                    Try again
                  </Button>
                </div>
              ))}
            {!floatPositions.isPending && !floatPositions.isError && floatRows.length === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No float has been given yet. Until one is given, an employee can record against the
                whole network float.
              </p>
            )}
            {floatRows.length > 0 && (
              <DataTable
                rows={floatRows}
                rowKey={(position) => `${position.userId}|${position.network}|${position.currency}`}
                columns={[
                  {
                    header: "Employee",
                    cell: (position) => staffNames.get(position.userId) ?? "Unknown staff",
                  },
                  {
                    header: "Network",
                    cell: (position) =>
                      networkNames.get(position.network) ?? momoNetworkLabel(position.network),
                  },
                  { header: "Currency", cell: (position) => position.currency },
                  {
                    header: "Given",
                    align: "right",
                    cell: (position) => formatMoney(position.allocated),
                  },
                  {
                    header: "Used",
                    align: "right",
                    cell: (position) => formatMoney(usedFloat(position)),
                  },
                  {
                    header: "Remaining",
                    align: "right",
                    cell: (position) => (
                      <span className="font-semibold">{formatMoney(position.remaining)}</span>
                    ),
                  },
                ]}
              />
            )}
          </SectionCard>
        </div>
      )}

      {canManageNetworks && (
        <div className="mt-6">
          <SectionCard
            title="Mobile money networks"
            action={
              networks.isError ? undefined : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNetworkForm({ network: null })}
                >
                  Add network
                </Button>
              )
            }
          >
            <p className="px-5 pb-3 text-sm text-muted-foreground">
              Add the wallets you work with: each one gets its own float account, so its balance
              stays separate, and a separate account per currency it holds. A network that already
              has transactions can be switched off, but not deleted.
            </p>
            {networks.isPending && (
              <p className="px-5 py-6 text-sm text-muted-foreground">Loading networks…</p>
            )}{" "}
            {networks.isError &&
              (isSetupMissing(networks.error.message) ? (
                <SetupNotice file="supabase/migrations/20261104150000_reference_data.sql">
                  <p className="text-muted-foreground">
                    Recording keeps working with MTN and Airtel until then.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void networks.refetch()}>
                    Try again
                  </Button>
                </SetupNotice>
              ) : (
                <div className="space-y-2 px-5 py-6 text-sm">
                  <p className="text-destructive">{networks.error.message}</p>
                  <Button variant="outline" size="sm" onClick={() => void networks.refetch()}>
                    Try again
                  </Button>
                </div>
              ))}
            {!networks.isPending && !networks.isError && (networks.data ?? []).length === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No networks yet. Add the first one to start recording.
              </p>
            )}
            {(networks.data ?? []).length > 0 && (
              <DataTable
                rows={networks.data ?? []}
                rowKey={(network) => network.code}
                columns={[
                  {
                    header: "Network",
                    cell: (network) => <span className="font-medium">{network.name}</span>,
                  },
                  {
                    header: "Code",
                    cell: (network) => (
                      <span className="text-xs text-muted-foreground">{network.code}</span>
                    ),
                  },
                  {
                    header: "Float account",
                    cell: (network) =>
                      accountNames.get(network.floatAccountCode) ?? network.floatAccountCode,
                  },
                  {
                    header: "Float balances",
                    cell: (network) => {
                      const rows = floatBalances.get(network.code) ?? [];
                      if (balances.isError) {
                        return (
                          <span className="text-xs text-muted-foreground">Balance unavailable</span>
                        );
                      }
                      if (rows.length === 0) {
                        return (
                          <span className="text-xs text-muted-foreground">
                            {balances.isPending || currencyFloats.isPending ? "Loading…" : "—"}
                          </span>
                        );
                      }
                      return (
                        <div className="space-y-0.5">
                          {rows.map((row) => (
                            <div key={row.accountCode} className="tabular text-sm">
                              <span className="font-medium">{formatMoney(row.amount)}</span>
                              {row.ledger && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {formatMoney(row.ledger)}
                                </span>
                              )}
                              <span
                                className="ml-2 text-xs text-muted-foreground"
                                title={`Account ${row.accountCode}`}
                              >
                                {row.accountCode}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    },
                  },
                  {
                    header: "Status",
                    cell: (network) =>
                      network.active ? (
                        <Badge variant="outline" className="font-normal">
                          In use
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal">
                          Switched off
                        </Badge>
                      ),
                  },
                  {
                    header: "",
                    align: "right",
                    cell: (network) => (
                      <Button variant="ghost" size="sm" onClick={() => setNetworkForm({ network })}>
                        Edit
                      </Button>
                    ),
                  },
                  {
                    header: "",
                    align: "right",
                    cell: (network) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={removeNetwork.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${network.name}? A network that already has transactions cannot be deleted — switch it off instead.`,
                            )
                          ) {
                            removeNetwork.mutate(network.code);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    ),
                  },
                ]}
              />
            )}
            <p className="px-5 pb-4 text-xs text-muted-foreground">
              Every float is posted in the ledger at its UGX value, so a USD (or other foreign)
              float is shown back in its own currency at today&apos;s published buy rate, with the
              UGX value beside it.
            </p>
          </SectionCard>
        </div>
      )}

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
          networks={networkOptions}
          foreignRates={foreignRateOptions}
          floatPositions={myFloats}
          open
          saving={saveMomo.isPending}
          onOpenChange={setRecordForm}
          onSave={(values) => saveMomo.mutate(values)}
        />
      )}

      {/* Correction keeps the original: it is reversed, and the edit is reposted. */}
      {correcting && (
        <MomoDialog
          branches={branchOptions}
          customers={customerOptions}
          networks={networkOptions}
          foreignRates={foreignRateOptions}
          initial={formValuesFor(correcting)}
          correcting
          floatPositions={myFloats}
          open
          saving={correct.isPending}
          onOpenChange={(next) => {
            if (!next) setCorrecting(null);
          }}
          onSave={(values, reason) =>
            correct.mutate({ momoId: correcting.id, values, reason: reason ?? "" })
          }
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

      {networkForm && (
        <MomoNetworkDialog
          network={networkForm.network}
          floatAccounts={floatAccounts.data ?? []}
          open
          saving={saveNetwork.isPending}
          onOpenChange={(next) => {
            if (!next) setNetworkForm(null);
          }}
          onSave={(values) => saveNetwork.mutate(values)}
        />
      )}

      {floatForm && (
        <StaffFloatDialog
          employees={staffOptions}
          networks={networkOptions}
          currencies={floatCurrencies}
          positions={floatPositions.data ?? []}
          open
          saving={allocateFloat.isPending}
          onOpenChange={setFloatForm}
          onSave={(values) => allocateFloat.mutate(values)}
        />
      )}

      {receipt && (
        <MomoReceiptDialog
          receipt={receipt}
          settings={settings.data ?? null}
          branchName={branchNames.get(receipt.branchId) ?? "—"}
          servedBy={viewer?.displayName ?? "—"}
          networkName={networkNames.get(receipt.network)}
          open
          onOpenChange={(next) => {
            if (!next) setReceipt(null);
          }}
        />
      )}
    </AppShell>
  );
}
