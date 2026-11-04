/**
 * Company settings data access.
 *
 * One row, read by any active staff member and written only by super admins and
 * the company owner (enforced by the UPDATE policy and the column grants).
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_APP_NAME, DEFAULT_BRAND_COLOR, normalizeHex } from "@/domain/branding";
import {
  RECEIPT_FORMATS,
  settingsErrorMessage,
  type CompanySettings,
  type CompanySettingsForm,
  type ReceiptFormat,
} from "@/domain/settings";

export interface CompanySettingsRow {
  company_name: string;
  legal_name: string;
  address: string;
  phone: string;
  email: string;
  tax_number: string;
  app_name: string;
  logo_url: string;
  theme_primary: string;
  base_currency: string;
  currency_codes: string[];
  receipt_format: string;
  receipt_footer: string;
  fiscal_year_start_month: number;
  updated_at: string;
}

const FORMAT_SET = new Set<string>(RECEIPT_FORMATS);

export function mapSettings(row: CompanySettingsRow): CompanySettings {
  return {
    companyName: row.company_name,
    legalName: row.legal_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    taxNumber: row.tax_number,
    appName: row.app_name?.trim() || DEFAULT_APP_NAME,
    logoUrl: row.logo_url ?? "",
    themePrimary: normalizeHex(row.theme_primary ?? "") ?? DEFAULT_BRAND_COLOR,
    baseCurrency: row.base_currency,
    currencyCodes: row.currency_codes ?? [],
    receiptFormat: (FORMAT_SET.has(row.receipt_format)
      ? row.receipt_format
      : "80mm") as ReceiptFormat,
    receiptFooter: row.receipt_footer,
    fiscalYearStartMonth: row.fiscal_year_start_month,
    updatedAt: row.updated_at,
  };
}

export async function getSettings(): Promise<CompanySettings> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(settingsErrorMessage(error.message));
  if (!data) throw new Error("Company settings have not been initialised for this deployment.");
  return mapSettings(data as unknown as CompanySettingsRow);
}

export async function updateSettings(input: CompanySettingsForm): Promise<void> {
  const { error } = await supabase
    .from("company_settings")
    .update({
      company_name: input.companyName,
      legal_name: input.legalName,
      address: input.address,
      phone: input.phone,
      email: input.email,
      tax_number: input.taxNumber,
      app_name: input.appName,
      logo_url: input.logoUrl,
      theme_primary: input.themePrimary,
      receipt_format: input.receiptFormat,
      receipt_footer: input.receiptFooter,
      fiscal_year_start_month: input.fiscalYearStartMonth,
    })
    .eq("id", true);
  if (error) throw new Error(settingsErrorMessage(error.message));
}

export const settingsQuery = queryOptions({
  queryKey: ["settings", "company"],
  queryFn: getSettings,
  staleTime: 30_000,
});
