import { supabase } from "@/integrations/supabase/client";
import { parseMoney } from "@/domain/money";
import type { CompanySettings } from "@/domain/settings";
import { toMoney } from "./ledger.service";
import type { FxRecord } from "./forex.service";
import type { MomoNetwork, MomoType } from "@/domain/momo";
import type { Money } from "@/domain/money";

/** Everything a mobile money receipt prints. Defined here so the dialog and this page share it without a cycle. */
export interface MomoReceiptData {
  id: string;
  branchId: string;
  network: MomoNetwork;
  type: MomoType;
  amount: Money;
  commission: Money;
  entryDate: string;
  customer: string;
  networkRef: string;
  notes: string;
}

/**
 * Public receipt lookup used by the QR link. Anyone holding the link can read
 * the one receipt it names; the database returns only the printed fields.
 * Migration: supabase/migrations/20261105120000_public_receipts.sql
 */

type Row = Record<string, unknown>;
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type PublicReceipt =
  | { kind: "fx"; record: FxRecord; branchName: string; servedBy: string }
  | {
      kind: "momo";
      record: MomoReceiptData;
      networkName: string;
      branchName: string;
      servedBy: string;
    };

export interface PublicReceiptPage {
  receipt: PublicReceipt;
  settings: CompanySettings;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Only the fields the printed header uses; the rest of the profile is not needed. */
function companyFromRow(row: Row): CompanySettings {
  return {
    companyName: str(row["companyName"]) || "FinDesk",
    legalName: "",
    address: str(row["address"]),
    phone: str(row["phone"]),
    email: str(row["email"]),
    taxNumber: str(row["taxNumber"]),
    appName: "FinDesk",
    logoUrl: "",
    themePrimary: "",
    baseCurrency: "UGX",
    currencyCodes: [],
    receiptFormat: "80mm",
    receiptFooter: str(row["receiptFooter"]),
    fiscalYearStartMonth: 1,
    updatedAt: "",
  };
}

function fxFromRow(row: Row): FxRecord {
  const currency = str(row["currency"]);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Unknown currency: ${currency}`);
  return {
    id: str(row["id"]),
    type: str(row["type"]) as FxRecord["type"],
    currency,
    foreignAmount: parseMoney(String(row["foreignAmount"]), currency),
    rate: String(row["rate"]),
    costRate: "",
    ugxAmount: toMoney(String(row["ugxAmount"])),
    costAmount: toMoney(String(row["costAmount"])),
    margin: toMoney(String(row["margin"])),
    settlement: str(row["settlement"]) as FxRecord["settlement"],
    branchId: "",
    customerRef: str(row["customerRef"]),
    receiptNo: str(row["receiptNo"]),
    notes: str(row["notes"]),
    entryDate: str(row["entryDate"]),
    createdBy: null,
    createdAt: "",
  };
}

function momoFromRow(row: Row): MomoReceiptData {
  return {
    id: str(row["id"]),
    branchId: "",
    network: str(row["network"]) as MomoNetwork,
    type: str(row["type"]) as MomoType,
    amount: toMoney(String(row["amount"])),
    commission: toMoney(String(row["commission"])),
    entryDate: str(row["entryDate"]),
    customer: str(row["customer"]),
    networkRef: str(row["networkRef"]),
    notes: str(row["notes"]),
  };
}

/** Absolute link the QR code opens: the receipt page on this app's origin. */
export function receiptLink(kind: "fx" | "momo", id: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/receipt/${kind}/${encodeURIComponent(id)}`;
}

export async function getPublicReceipt(
  kind: "fx" | "momo",
  id: string,
): Promise<PublicReceiptPage | null> {
  // The generated Database types predate these functions, so the call is typed locally.
  const client = supabase as unknown as RpcClient;
  const [receiptRes, companyRes] = await Promise.all([
    client.rpc("get_public_receipt", { _kind: kind, _id: id }),
    client.rpc("get_public_receipt_company", {}),
  ]);
  if (receiptRes.error) throw new Error(receiptRes.error.message);
  if (companyRes.error) throw new Error(companyRes.error.message);
  const row = receiptRes.data as Row | null;
  if (!row) return null;

  const branchName = str(row["branchName"]);
  const servedBy = str(row["servedBy"]);
  const receipt: PublicReceipt =
    kind === "fx"
      ? { kind: "fx", record: fxFromRow(row), branchName, servedBy }
      : {
          kind: "momo",
          record: momoFromRow(row),
          networkName: str(row["networkName"]),
          branchName,
          servedBy,
        };
  return { receipt, settings: companyFromRow((companyRes.data ?? {}) as Row) };
}
