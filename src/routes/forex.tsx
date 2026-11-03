import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { FxDialog, type FxTradeValues } from "@/components/forex/FxDialog";
import { RateDialog } from "@/components/forex/RateDialog";
import {
  AccessDenied,
  DataTable,
  PageHeader,
  PlannedNext,
  SectionCard,
  StatCard,
} from "@/components/shared";
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
  const [search, setSearch] = useState("");
  const [recordTrade, setRecordTrade] = useState(false);
  const [publishRate, setPublishRate] = useState(false);

  const rates = useQuery({ ...fxRatesQuery, enabled: allowed });
  const trades = useQuery({ ...fxQuery(100), enabled: allowed });
  const branches = useQuery({ ...branchesQuery, enabled: allowed });
  const queryClient = useQueryClient();

  const branchOptions = (branches.data ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
  }));
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

  const saveRate = useMutation({
    mutationFn: (values: FxRateInput) => setFxRate(values),
    onSuccess: () => {
      toast.success("Rate published.");
      void queryClient.invalidateQueries({ queryKey: ["forex"] });
      setPublishRate(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = trades.data ?? [];
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
        <StatCard label="Margin" value={formatMoney(money(margin, BASE_CURRENCY))} hint="UGX" />
        <StatCard
          label="Currencies traded"
          value={String(new Set(rows.map((trade) => trade.currency)).size)}
        />
      </div>

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
          {visibleRows.length > 0 && <TradesTable rows={visibleRows} />}
        </SectionCard>
      </div>

      <PlannedNext features={["Inter-branch currency transfers", "Printed receipts"]} />

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
    </AppShell>
  );
}

function TradesTable({ rows }: { rows: FxRecord[] }) {
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
