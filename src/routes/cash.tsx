import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { t } from "@/domain/i18n";
import { AccessDenied, DataTable, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { can } from "@/domain/access";
import { useSession } from "@/hooks/use-session";
import {
  CASH_KIND_LABELS,
  cashQuery,
  type CashBranch,
  type CashPosition,
  type CashPosting,
  type CashSnapshot,
} from "@/services/cash.service";

export const Route = createFileRoute("/cash")({
  head: () => ({
    meta: [
      { title: "Cash & Float — FinDesk" },
      { name: "description", content: "Tills, safes, mobile money float and reconciliation." },
      { property: "og:title", content: "Cash & Float — FinDesk" },
      {
        property: "og:description",
        content: "Tills, safes, mobile money float and reconciliation.",
      },
    ],
  }),
  component: Cash,
});

function Cash() {
  const { viewer } = useSession();
  const allowed = Boolean(viewer && can(viewer.roles, "cash.manage"));
  const snapshot = useQuery({ ...cashQuery, enabled: allowed });

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title={t("Cash & Float")}
          description={t("Tills, safes, mobile money float and reconciliation.")}
        />
        <AccessDenied
          title="This module is restricted"
          description="Cash and float management is available to staff with cash management permissions. Ask a super admin or the company owner to review your roles."
        />
      </AppShell>
    );
  }

  const snap: CashSnapshot | undefined = snapshot.data;
  const loading = snapshot.isPending;
  const hasData = snap?.hasData ?? false;

  return (
    <AppShell>
      <PageHeader
        title={t("Cash & Float")}
        description={t("Tills, safes, mobile money float and reconciliation.")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void snapshot.refetch()}
            disabled={snapshot.isFetching}
          >
            {snapshot.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {loading && <p className="mb-6 text-sm text-muted-foreground">Loading cash position…</p>}

      {snapshot.isError && (
        <div className="m-4 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm">
          <p className="text-destructive font-medium">
            Could not load cash position: {snapshot.error.message}
          </p>
        </div>
      )}

      {!loading && snap && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Physical cash"
              value={formatMoney(snap.totals.physical)}
              hint="Notes and coins on hand"
            />
            <StatCard label="Bank" value={formatMoney(snap.totals.bank)} hint="Bank account" />
            <StatCard
              label="MoMo float"
              value={formatMoney(snap.totals.float)}
              hint="Every mobile money wallet"
            />
            <StatCard
              label="Staff advances"
              value={formatMoney(snap.totals.imprest)}
              hint="Money held by tellers"
            />
            <StatCard
              label="Total position"
              value={formatMoney(snap.totals.total)}
              hint="All cash & float"
            />
          </div>

          <SectionCard title={t("Cash positions")}>
            <p className="text-xs text-muted-foreground mb-2">
              Full ledger balance per cash and float account, with the change from the latest
              postings.
            </p>
            <div className="divide-y">
              {snap.positions.map((position) => (
                <CashPositionRow key={position.code} position={position} />
              ))}
            </div>
          </SectionCard>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <SectionCard title={t("Branch net movement")}>
              <p className="text-xs text-muted-foreground mb-2">
                Net change on cash and float accounts per branch, from recent postings.
              </p>
              <div className="divide-y">
                {snap.branches.map((branch) => (
                  <BranchRow key={branch.branch} branch={branch} />
                ))}
              </div>
            </SectionCard>
            <SectionCard title={t("Recent cash postings")}>
              <p className="text-xs text-muted-foreground mb-2">
                Latest individual postings that touched cash or float accounts.
              </p>
              <div className="divide-y">
                {snap.recent.slice(0, 12).map((posting, index) => (
                  <PostingRow key={index} posting={posting} />
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}

      <div className="mt-4 text-xs text-muted-foreground">
        Every figure above is derived from posted journal entries, so it always agrees with the
        ledger. An empty ledger shows zeros here.
      </div>
    </AppShell>
  );
}

function CashPositionRow({ position }: { position: CashPosition }) {
  const movementText =
    position.movement.minor === 0n
      ? "No recent movement"
      : `Movement ${formatMoney(position.movement)} (${position.movement.minor > 0n ? "in" : "out"})`;
  return (
    <div className="flex justify-between border-t px-4 py-2.5 text-sm">
      <div className="flex gap-x-2">
        <span className="tabular font-medium">{position.code}</span>
        <span className="truncate">{position.name}</span>
        <Badge variant="outline" className="text-[10px]">
          {CASH_KIND_LABELS[position.kind]}
        </Badge>
      </div>
      <div className="tabular text-right">
        <div className="tabular font-medium">{formatMoney(position.balance)}</div>
        <div className="text-xs text-muted-foreground">{movementText}</div>
      </div>
    </div>
  );
}

function BranchRow({ branch }: { branch: CashBranch }) {
  return (
    <div className="flex justify-between border-t px-4 py-2.5 text-sm">
      <div>{branch.branch}</div>
      <div className="tabular text-right">
        <div>{branch.postings} postings</div>
        <div className="tabular font-medium">
          {formatMoney(branch.net)} ({branch.net.minor >= 0n ? "in" : "out"})
        </div>
      </div>
    </div>
  );
}

function PostingRow({ posting }: { posting: CashPosting }) {
  const netClass = posting.net.minor >= 0n ? "text-foreground" : "text-destructive";
  return (
    <div className="flex justify-between border-t px-4 py-2.5 text-sm gap-x-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{posting.reference}</div>
        <div className="text-xs text-muted-foreground">
          {posting.account} · {posting.branch}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(posting.date).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
        <div className="text-xs">{posting.description}</div>
      </div>
      <div className={`tabular font-medium text-right ${netClass}`}>{formatMoney(posting.net)}</div>
    </div>
  );
}
