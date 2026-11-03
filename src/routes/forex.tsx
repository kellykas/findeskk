import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { FxDialog, type FxTradeValues } from "@/components/forex/FxDialog";
import { FxReceiptDialog } from "@/components/forex/FxReceiptDialog";
import { FxCurrencyDialog } from "@/components/forex/FxCurrencyDialog";
import { RateDialog } from "@/components/forex/RateDialog";
import { TransferDialog, type TransferValues } from "@/components/forex/TransferDialog";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, money } from "@/domain/money";
import { BASE_CURRENCY } from "@/domain/currency";
import {
  FX_CURRENCIES,
  FX_SETTLEMENT_LABELS,
  formatRate,
  fxCurrencyLabel,
  parseForeignAmount,
  type FxRateInput,
  type FxType,
} from "@/domain/forex";
import {
  activeCurrencies,
  type FxCurrencyForm,
  type FxCurrencyRecord,
} from "@/domain/referenceData";
import { can } from "@/domain/access";
import { referenceErrorMessage } from "@/domain/referenceDataMessages";
import { useSession } from "@/hooks/use-session";
import {
  fxQuery,
  fxRatesQuery,
  latestRates,
  recordFxTransaction,
  setFxRate,
  type FxRecord,
} from "@/services/forex.service";
import {
  deleteFxCurrency,
  fxCurrenciesQuery,
  saveFxCurrency,
} from "@/services/referenceData.service";
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
  const canTransfer = Boolean(viewer && can(viewer.roles, "forex.transfer"));
  // Currencies and their rates are every staff member's job: a teller cannot wait
  // for a manager to be around. Adding a network stays a manager decision.
  const canManageCurrencies = Boolean(viewer && can(viewer.roles, "currencies.manage"));
  const [search, setSearch] = useState("");
  const [recordTrade, setRecordTrade] = useState(false);
  // Null when closed; an empty object opens on the first currency, and a code
  // opens it preselected from that currency's row.
  const [publishRate, setPublishRate] = useState<{ currency?: string } | null>(null);
  const [currencyForm, setCurrencyForm] = useState<{ currency: FxCurrencyRecord | null } | null>(
    null,
  );
  const [transferOpen, setTransferOpen] = useState(false);
  const [receipt, setReceipt] = useState<FxRecord | null>(null);

  const rates = useQuery({ ...fxRatesQuery, enabled: allowed });
  const currencies = useQuery({ ...fxCurrenciesQuery, enabled: allowed });
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

  // Currency names come from the managed table; the built-in labels are only a
  // fallback for a code whose row is not loaded.
  const currencyNames = useMemo(
    () => new Map((currencies.data ?? []).map((currency) => [currency.code, currency.name])),
    [currencies.data],
  );
  const currencyOptions = useMemo(() => {
    const managed = activeCurrencies(currencies.data ?? []);
    if (managed.length > 0) return managed;
    // Before the reference-data setup is run, trading continues in the seeded
    // currencies so the module does not go dark.
    return currencies.isError
      ? FX_CURRENCIES.map((code) => ({ code, name: fxCurrencyLabel(code) }))
      : [];
  }, [currencies.data, currencies.isError]);
  const latestRateFor = (code: string) => currentRates.find((rate) => rate.currency === code);

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
      setPublishRate(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveCurrency = useMutation({
    mutationFn: (values: FxCurrencyForm) => saveFxCurrency(values),
    onSuccess: () => {
      toast.success("Currency saved.");
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
      setCurrencyForm(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeCurrency = useMutation({
    mutationFn: (code: string) => deleteFxCurrency(code),
    onSuccess: () => {
      toast.success("Currency deleted.");
      void queryClient.invalidateQueries({ queryKey: ["reference"] });
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
        label: currencyNames.get(currency) ?? fxCurrencyLabel(currency),
      }));
  }, [rows, currencyNames]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((trade) =>
      [
        trade.currency,
        currencyNames.get(trade.currency) ?? fxCurrencyLabel(trade.currency),
        trade.customerRef,
        trade.receiptNo,
        trade.type,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [rows, search, currencyNames]);

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
            {canManageCurrencies && (
              <Button variant="outline" size="sm" onClick={() => setPublishRate({})}>
                Publish rate
              </Button>
            )}
            {/* A transfer needs a second branch; with one branch there is nowhere to send it. */}
            {canTransfer && branchOptions.length > 1 && (
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
          label="Gross margin"
          value={formatMoney(money(margin, BASE_CURRENCY))}
          hint="Profit on the trades shown, before running costs"
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
              label={`${pos.currency} net bought`}
              value={`${pos.minor >= 0n ? "+" : ""}${(pos.minor / 100n).toString()}.${String(
                Math.abs(Number(pos.minor % 100n)),
              ).padStart(2, "0")} ${pos.currency}`}
              hint={`${pos.label} · buys minus sells in the trades shown`}
            />
          ))}
        </div>
      )}

      <SectionCard
        title="Currencies & rates"
        action={
          canManageCurrencies ? (
            <Button variant="outline" size="sm" onClick={() => setCurrencyForm({ currency: null })}>
              Add currency
            </Button>
          ) : (
            <Badge variant="outline">Latest per currency</Badge>
          )
        }
      >
        <p className="px-5 pb-3 text-sm text-muted-foreground">
          Add the currencies you trade and publish their rates. A currency that already has rates or
          trades can be switched off, but not deleted.
        </p>
        {currencies.isPending && (
          <p className="px-5 py-6 text-sm text-muted-foreground">Loading currencies…</p>
        )}
        {currencies.isError && (
          <div className="space-y-2 px-5 py-6 text-sm">
            <p className="text-destructive">{referenceErrorMessage(currencies.error.message)}</p>
            <p className="text-muted-foreground">
              Trading still works in USD, EUR, GBP and KES until the setup file is run.
            </p>
            <Button variant="outline" size="sm" onClick={() => void currencies.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!currencies.isPending && !currencies.isError && (currencies.data ?? []).length === 0 && (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No currencies yet. Add the first one, then publish its rate.
          </p>
        )}
        {rates.isError && !currencies.isError && (
          <p className="px-5 py-3 text-sm text-destructive">
            Could not load rates: {rates.error.message}
          </p>
        )}
        {(currencies.data ?? []).length > 0 && (
          <DataTable
            rows={currencies.data ?? []}
            rowKey={(currency) => currency.code}
            columns={[
              {
                header: "Currency",
                cell: (currency) => (
                  <span className="font-medium">
                    {currency.code} · {currency.name}
                  </span>
                ),
              },
              {
                header: "Buy (UGX)",
                align: "right",
                cell: (currency) => latestRateFor(currency.code)?.buyRate ?? "—",
              },
              {
                header: "Sell (UGX)",
                align: "right",
                cell: (currency) => latestRateFor(currency.code)?.sellRate ?? "—",
              },
              {
                header: "Effective",
                cell: (currency) => {
                  const rate = latestRateFor(currency.code);
                  return rate ? day(rate.effectiveFrom) : "No rate yet";
                },
              },
              {
                header: "Status",
                cell: (currency) =>
                  currency.active ? (
                    <Badge variant="outline" className="font-normal">
                      Trading
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="font-normal">
                      Switched off
                    </Badge>
                  ),
              },
              ...(canManageCurrencies
                ? [
                    {
                      header: "",
                      align: "right" as const,
                      cell: (currency: FxCurrencyRecord) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPublishRate({ currency: currency.code })}
                        >
                          Publish rate
                        </Button>
                      ),
                    },
                  ]
                : []),
              ...(canManageCurrencies
                ? [
                    {
                      header: "",
                      align: "right" as const,
                      cell: (currency: FxCurrencyRecord) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCurrencyForm({ currency })}
                        >
                          Edit
                        </Button>
                      ),
                    },
                    {
                      header: "",
                      align: "right" as const,
                      cell: (currency: FxCurrencyRecord) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={removeCurrency.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${currency.code}? A currency that already has rates or trades cannot be deleted — switch it off instead.`,
                              )
                            ) {
                              removeCurrency.mutate(currency.code);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
        {!currencies.isPending &&
          !currencies.isError &&
          (currencies.data ?? []).length > 0 &&
          currentRates.length === 0 && (
            <p className="px-5 py-3 text-xs text-muted-foreground">
              No rate is published yet. Trades cannot be recorded until a manager publishes one.
            </p>
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
              {branchOptions.length < 2
                ? "This company works from one branch, so there is nothing to transfer between branches."
                : "No currency has been moved between branches yet."}
            </p>
          )}
          {(transfers.data ?? []).length > 0 && (
            <TransfersTable rows={transfers.data ?? []} branchNames={branchNames} />
          )}
        </SectionCard>
      </div>

      {/* Mounted only while open: reopening starts a blank form rather than the last one. */}
      {recordTrade && (
        <FxDialog
          latestRates={currentRates}
          currencies={currencyOptions}
          branches={branchOptions}
          open
          saving={saveTrade.isPending}
          onOpenChange={setRecordTrade}
          onSave={(values) => saveTrade.mutate(values)}
        />
      )}
      {publishRate && (
        <RateDialog
          currencies={currencyOptions}
          {...(publishRate.currency ? { initialCurrency: publishRate.currency } : {})}
          open
          saving={saveRate.isPending}
          onOpenChange={(next) => {
            if (!next) setPublishRate(null);
          }}
          onSave={(values) => saveRate.mutate(values)}
        />
      )}
      {currencyForm && (
        <FxCurrencyDialog
          currency={currencyForm.currency}
          open
          saving={saveCurrency.isPending}
          onOpenChange={(next) => {
            if (!next) setCurrencyForm(null);
          }}
          onSave={(values) => saveCurrency.mutate(values)}
        />
      )}
      {transferOpen && (
        <TransferDialog
          branches={branchOptions}
          open
          saving={saveTransfer.isPending}
          onOpenChange={setTransferOpen}
          onSave={(values) => saveTransfer.mutate(values)}
        />
      )}
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
