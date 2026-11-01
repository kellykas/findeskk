/**
 * Dashboard data service.
 *
 * UI components depend on this interface only. Today it returns clearly
 * labelled demonstration data; in Phase 3 the implementation will read
 * ledger-derived balances from Supabase without changing any component.
 */
import { queryOptions } from "@tanstack/react-query";
import type { Money } from "@/domain/money";
import { demoDashboard } from "./demo/dashboard.demo";

export interface BalanceItem {
  label: string;
  kind: "physical_cash" | "electronic_float";
  amount: Money;
}

export interface RecentTransaction {
  reference: string;
  type: "forex_buy" | "forex_sell" | "momo_deposit" | "momo_withdrawal";
  branch: string;
  teller: string;
  amount: Money;
  time: string;
  /** Manually recorded entries are never network-verified. */
  verification: "manual" | "network_verified";
}

export interface BranchSummary {
  name: string;
  transactions: number;
  volume: Money;
}

export interface DashboardSnapshot {
  source: "demo" | "ledger";
  asOf: string;
  balances: BalanceItem[];
  kpis: { label: string; value: Money | number }[];
  recent: RecentTransaction[];
  branches: BranchSummary[];
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  return demoDashboard();
}

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard", "snapshot"],
  queryFn: getDashboardSnapshot,
});
