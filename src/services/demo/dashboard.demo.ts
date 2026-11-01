/**
 * DEMONSTRATION DATA ONLY. Not real balances or transactions.
 * Delete this file once the ledger-backed service lands (Phase 3).
 */
import { money } from "@/domain/money";
import type { DashboardSnapshot } from "../dashboard.service";

export function demoDashboard(): DashboardSnapshot {
  return {
    source: "demo",
    asOf: "2026-11-01T09:00:00Z",
    balances: [
      { label: "UGX cash", kind: "physical_cash", amount: money(48_750_000n, "UGX") },
      { label: "USD cash", kind: "physical_cash", amount: money(1_254_000n, "USD") },
      { label: "EUR cash", kind: "physical_cash", amount: money(386_050n, "EUR") },
      { label: "GBP cash", kind: "physical_cash", amount: money(212_000n, "GBP") },
      { label: "MTN float", kind: "electronic_float", amount: money(22_400_000n, "UGX") },
      { label: "Airtel float", kind: "electronic_float", amount: money(14_850_000n, "UGX") },
    ],
    kpis: [
      { label: "Transactions today", value: 184 },
      { label: "Volume today", value: money(96_320_000n, "UGX") },
      { label: "Commissions", value: money(1_184_500n, "UGX") },
      { label: "Expenses", value: money(420_000n, "UGX") },
    ],
    recent: [
      { reference: "FX-000412", type: "forex_buy", branch: "Kampala Road", teller: "A. Namutebi", amount: money(50_000n, "USD"), time: "08:52", verification: "manual" },
      { reference: "MM-001873", type: "momo_deposit", branch: "Ntinda", teller: "J. Okello", amount: money(250_000n, "UGX"), time: "08:47", verification: "manual" },
      { reference: "FX-000411", type: "forex_sell", branch: "Kampala Road", teller: "A. Namutebi", amount: money(20_000n, "EUR"), time: "08:41", verification: "manual" },
      { reference: "MM-001872", type: "momo_withdrawal", branch: "Entebbe", teller: "S. Achieng", amount: money(1_200_000n, "UGX"), time: "08:33", verification: "manual" },
      { reference: "MM-001871", type: "momo_deposit", branch: "Ntinda", teller: "J. Okello", amount: money(75_000n, "UGX"), time: "08:20", verification: "manual" },
    ],
    branches: [
      { name: "Kampala Road", transactions: 82, volume: money(51_200_000n, "UGX") },
      { name: "Ntinda", transactions: 64, volume: money(28_900_000n, "UGX") },
      { name: "Entebbe", transactions: 38, volume: money(16_220_000n, "UGX") },
    ],
  };
}
