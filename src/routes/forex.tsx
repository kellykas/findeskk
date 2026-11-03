import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { FxDialog, type FxTradeValues } from "@/components/forex/FxDialog";
import { FxReceiptDialog } from "@/components/forex/FxReceiptDialog";
import { RateDialog } from "@/components/forex/RateDialog";
import { TransferDialog, type TransferValues } from "@/components/forex/TransferDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import {
  FX_CURRENCY_LABELS,
  FX_SETTLEMENT_LABELS,
  formatRate,
  parseForeignAmount,
  type FxRateInput,
  type FxType,
} from "@/domain/forex";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import {
  fxQuery,
  fxRatesQuery,
  latestRates,
  recordFxTransaction,
  setFxRate,
  type FxRecord,
} from "@/services/forex.service";
import { branchesQuery } from "@/services/staff.service";
import { settingsQuery } from "@/services/settings.service";
import { recordTransfer, transfersQuery } from "@/services/transfers.service";
import {
  TRANSFER_CURRENCY_LABELS,
  formatTransferAmount,
  parseTransferAmount,
  type TransferRecord,
} from "@/domain/transfers";

export const Route = createFileRoute("/forex")({
  head: () => ({
    meta: [
      { title: "Forex Bureau — FinDesk" },
      { name: "description", content: "Buy and sell foreign currency and manage exchange rates." },
      { property: "og:title", content: "Forex Bureau — FinDesk" },
      {
        property: "og:description",
        content: "Buy and sell foreign currency and manage exchange rates.",
      },
    ],
  }),
  component: Forex,
});

const day = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Forex() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "forex.transact"));
  const canManageRates = Boolean(viewer && can(viewer.roles, "forex.rates.manage"));
  const canTransfer = Boolean(viewer && can(viewer.roles, "forex.transfer"));
  const [search, setSearch] = useState("");
  const [recordTrade, setRecordTrade] = useState(false);
  const [publishRate, setPublishRate] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receipt, setReceipt] = useState<FxRecord | null>(null);

  const rates = useQuery({ ...fxRatesQuery, enabled: allowed });
  const trades = useQuery({ ...fxQuery(100), enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const transfers = useQuery({ ...transfersQuery(100), enabled: allowed });
  const settings = useQuery(settingsQuery);
  const queryClient = useQueryClient();

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
  const branchNames = new Map(branchOptions.map((b) => [b.id, `${b.code} · ${b.name}`]));
  const currentRates = latestRates(rates.data ?? []);

  const saveTrade = useMutation({
    mutationFn: (values: FxTradeValues) =>
      recordFxTransaction({
        type: values.type,
        currency: values.currency,
        foreignAmount: money(parseForeignAmount(values.foreignAmount) ?? 0n, values.currency),
        rate: values.rate,
        costRate: values.costRate,
        settlement: values.settlement,
        branchId: values.branchId,
        customerRef: values.customerRef,
        receiptNo: values.receiptNo,
        notes: values.notes,
        entryDate: values.entryDate,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success("Trade recorded and posted to the ledger.");
      void queryClient.invalidateQueries({ queryKey: ["forex"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setRecordTrade(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveTransfer = useMutation({
    mutationFn: (values: TransferValues) => {
      const amount = parseTransferAmount(values.amount, values.currency);
      if (!amount) throw new Error("Enter an amount greater than zero.");
      return recordTransfer({
        currency: values.currency,
        amount,
        fromBranchId: values.fromBranchId,
        toBranchId: values.toBranchId,
        reference: values.reference,
        notes: values.notes,
        entryDate: values.entryDate,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      toast.success("Transfer recorded and posted to both branches.");
      void queryClient.invalidateQueries({ queryKey: ["forex"] });
      void queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setTransferOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveRate = useMutation({
    mutationFn: (values: FxRateInput) => setFxRate(values),
    onSuccess: () => {
      toast.success("Rate published.");
      void queryClient.invalidateQueries({ queryKey: ["forex"] });
      setPublishRate(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => trades.data ?? [], [trades.data]);

  // Net holding per currency from the trades on screen: buys add to inventory,
  // sells take from it.
  const positions = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const trade of rows) {
      const key = trade.currency;
      const current = map.get(key) ?? 0n;
      if (trade.type === "buy") {
        map.set(key, current + trade.foreignAmount.minor);
      } else {
        map.set(key, current - trade.foreignAmount.minor);
      }
    }
    return [...map.entries()]
      .filter(([, amt]) => amt !== 0n)
      .map(([currency, minor]) => ({
        currency,
        minor,
        label: FX_CURRENCY_LABELS[currency as keyof typeof FX_CURRENCY_LABELS],
      }));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((trade) =>
      [
        trade.currency,
        FX_CURRENCY_LABELS[trade.currency],
        trade.customerRef,
        trade.receiptNo,
        trade.type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search]);

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader title="Forex Bureau" description="Buy and sell foreign currency." />
        <AccessDenied
          title="Forex trading is restricted"
          description="Forex trading is available to staff with forex permissions. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  const turnover = rows.reduce((total, trade) => total + trade.ugxAmount.minor, 0n);
  const margin = rows.reduce((total, trade) => total + trade.margin.minor, 0n);

  return (
    <AppShell>
      <PageHeader
        title="Forex Bureau"
        description="Buy and sell foreign currency and manage exchange rates."
        actions={
          <>
            {canManageRates && (
              <Button variant="outline" size="sm" onClick={() => setPublishRate(true)}>
                Publish rate
              </Button>
            )}
            {canTransfer && (
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                Transfer
              </Button>
            )}
            <Button size="sm" onClick={() => setRecordTrade(true)}>
              Record trade
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trades shown" value={String(rows.length)} hint="Latest 100" />
        <StatCard
          label="Turnover"
          value={formatMoney(money(turnover, BASE_CURRENCY))}
          hint="UGX value traded"
        />
        <StatCard
          label="Margin (profit)"
          value={formatMoney(money(margin, BASE_CURRENCY))}
          hint="UGX"
        />
        <StatCard
          label="Currencies traded"
          value={String(new Set(rows.map((trade) => trade.currency)).size)}
        />
      </div>

      {positions.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {positions.map((pos) => (
            <StatCard
              key={pos.currency}
              label={`${pos.currency} position`}
              value={`${pos.minor >= 0n ? "+" : ""}${(pos.minor / 100n).toString()}.${String(
                Math.abs(Number(pos.minor % 100n)),
              ).padStart(2, "0")} ${pos.currency}`}
              hint={pos.label}
            />
          ))}
        </div>
      )}

      <SectionCard
        title="Published rates"
        action={<Badge variant="outline">Latest per currency</Badge>}
      >
        {rates.isPending && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading rates…</p>
        )}
        {rates.isError && (
          <div className="space-y-2 px-4 py-6 text-sm">
            <p className="text-destructive">Could not load rates: {rates.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void rates.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!rates.isPending && !rates.isError && currentRates.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No rates published yet. A rate manager must publish a rate before trades can be
            recorded.
          </p>
        )}
        {currentRates.length > 0 && (
          <DataTable
            rows={currentRates}
            rowKey={(rate) => rate.id}
            columns={[
              {
                header: "Currency",
                cell: (rate) => (
                  <span className="font-medium">
                    {rate.currency} · {FX_CURRENCY_LABELS[rate.currency]}
                  </span>
                ),
              },
              { header: "Buy (UGX)", align: "right", cell: (rate) => rate.buyRate },
              { header: "Sell (UGX)", align: "right", cell: (rate) => rate.sellRate },
              { header: "Effective", cell: (rate) => day(rate.effectiveFrom) },
            ]}
          />
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard
          title="Trades"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void trades.refetch()}
              disabled={trades.isFetching}
            >
              {trades.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          }
        >
          <div className="px-4 pt-4">
            <input
              className="mb-3 w-full max-w-xs rounded-md border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="Search by currency, customer or receipt"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {trades.isPending && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading trades…</p>
          )}
          {trades.isError && (
            <div className="space-y-2 px-4 py-6 text-sm">
              <p className="text-destructive">Could not load trades: {trades.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void trades.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {!trades.isPending && !trades.isError && visibleRows.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {search ? "No trades match that search." : "No trades recorded yet."}
            </p>
          )}
          {visibleRows.length > 0 && (
            <TradesTable
              rows={visibleRows}
              branchNames={branchNames}
              onReceipt={(trade) => setReceipt(trade)}
            />
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard
          title="Branch transfers"
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void transfers.refetch()}
              disabled={transfers.isFetching}
            >
              {transfers.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          }
        >
          {transfers.isPending && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading transfers…</p>
          )}
          {transfers.isError && (
            <div className="space-y-2 px-4 py-6 text-sm">
              <p className="text-destructive">
                Could not load transfers: {transfers.error.message}
              </p>
              <Button variant="outline" size="sm" onClick={() => void transfers.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {!transfers.isPending && !transfers.isError && (transfers.data ?? []).length === 0 && (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No currency has been moved between branches yet.
            </p>
          )}
          {(transfers.data ?? []).length > 0 && (
            <TransfersTable rows={transfers.data ?? []} branchNames={branchNames} />
          )}
        </SectionCard>
      </div>

      <FxDialog
        latestRates={currentRates}
        branches={branchOptions}
        open={recordTrade}
        saving={saveTrade.isPending}
        onOpenChange={setRecordTrade}
        onSave={(values) => saveTrade.mutate(values)}
      />
      <RateDialog
        open={publishRate}
        saving={saveRate.isPending}
        onOpenChange={setPublishRate}
        onSave={(values) => saveRate.mutate(values)}
      />
      <TransferDialog
        branches={branchOptions}
        open={transferOpen}
        saving={saveTransfer.isPending}
        onOpenChange={setTransferOpen}
        onSave={(values) => saveTransfer.mutate(values)}
      />
      <FxReceiptDialog
        open={Boolean(receipt)}
        trade={receipt}
        settings={settings.data ?? null}
        branchName={receipt ? (branchNames.get(receipt.branchId) ?? "—") : "—"}
        servedBy={viewer?.displayName ?? "—"}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      />
    </AppShell>
  );
}

function TransfersTable({
  rows,
  branchNames,
}: {
  rows: TransferRecord[];
  branchNames: Map<string, string>;
}) {
  return (
    <DataTable
      rows={rows}
      rowKey={(transfer) => transfer.id}
      columns={[
        { header: "Date", cell: (transfer) => day(transfer.entryDate) },
        {
          header: "Currency",
          cell: (transfer) => (
            <span className="font-medium">
              {transfer.currency} · {TRANSFER_CURRENCY_LABELS[transfer.currency]}
            </span>
          ),
        },
        {
          header: "Amount",
          align: "right",
          cell: (transfer) => formatTransferAmount(transfer),
        },
        { header: "From", cell: (transfer) => branchNames.get(transfer.fromBranchId) ?? "—" },
        { header: "To", cell: (transfer) => branchNames.get(transfer.toBranchId) ?? "—" },
        {
          header: "Reference / notes",
          cell: (transfer) => transfer.reference || transfer.notes || "—",
        },
      ]}
    />
  );
}

function TradesTable({
  rows,
  branchNames,
  onReceipt,
}: {
  rows: FxRecord[];
  branchNames: Map<string, string>;
  onReceipt: (trade: FxRecord) => void;
}) {
  return (
    <DataTable
      rows={rows}
      rowKey={(trade) => trade.id}
      columns={[
        { header: "Date", cell: (trade) => day(trade.entryDate) },
        {
          header: "Trade",
          cell: (trade) => (
            <span className="font-medium">
              {labelForType(trade.type)} {trade.currency}
            </span>
          ),
        },
        {
          header: "Foreign amount",
          align: "right",
          cell: (trade) => formatForeignAmount(trade),
        },
        { header: "Rate", align: "right", cell: (trade) => formatRate(trade.rate) },
        { header: "UGX", align: "right", cell: (trade) => formatMoney(trade.ugxAmount) },
        {
          header: "Margin",
          align: "right",
          cell: (trade) => (
            <span className={trade.margin.minor < 0n ? "text-destructive" : undefined}>
              {formatMoney(trade.margin)}
            </span>
          ),
        },
        { header: "Settlement", cell: (trade) => FX_SETTLEMENT_LABELS[trade.settlement] },
        {
          header: "Customer / receipt",
          cell: (trade) => trade.customerRef || trade.receiptNo || "—",
        },
        {
          header: "Branch",
          cell: (trade) => branchNames.get(trade.branchId) ?? "—",
        },
        {
          header: "",
          cell: (trade) => (
            <Button variant="ghost" size="sm" onClick={() => onReceipt(trade)}>
              Receipt
            </Button>
          ),
        },
      ]}
    />
  );
}

function labelForType(type: FxType): string {
  return type === "buy" ? "Buy" : "Sell";
}

function formatForeignAmount(trade: FxRecord): string {
  const minor = trade.foreignAmount.minor;
  const whole = (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (minor % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction} ${trade.currency}`;
}
