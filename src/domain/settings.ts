/**
 * Company settings vocabulary.
 *
 * Settings are stored in one row of public.company_settings. The database
 * re-checks the same length and vocabulary rules through a CHECK constraint and
 * only lets super admins and the company owner update the row.
 */
import { z } from "zod";

export const RECEIPT_FORMATS = ["58mm", "80mm", "a4"] as const;

export type ReceiptFormat = (typeof RECEIPT_FORMATS)[number];

export const RECEIPT_FORMAT_LABELS: Record<ReceiptFormat, string> = {
  "58mm": "Thermal 58mm",
  "80mm": "Thermal 80mm",
  a4: "A4 page",
};

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export interface CompanySettings {
  companyName: string;
  legalName: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  baseCurrency: string;
  currencyCodes: string[];
  receiptFormat: ReceiptFormat;
  receiptFooter: string;
  fiscalYearStartMonth: number;
  updatedAt: string;
}

export const companySettingsSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(80, "Company name can have at most 80 characters"),
  legalName: z.string().trim().max(120, "Legal name can have at most 120 characters"),
  address: z.string().trim().max(200, "Address can have at most 200 characters"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone can have at most 30 characters")
    .regex(/^[0-9+() -]*$/, "Phone can only contain digits, spaces and + ( ) -"),
  email: z
    .string()
    .trim()
    .max(120, "Email can have at most 120 characters")
    .refine(
      (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      "Enter a valid email or leave it empty",
    ),
  taxNumber: z.string().trim().max(40, "Tax number can have at most 40 characters"),
  receiptFormat: z.enum(RECEIPT_FORMATS),
  receiptFooter: z.string().trim().max(200, "Receipt footer can have at most 200 characters"),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
});

export type CompanySettingsForm = z.infer<typeof companySettingsSchema>;

export function toSettingsForm(settings: CompanySettings): CompanySettingsForm {
  return {
    companyName: settings.companyName,
    legalName: settings.legalName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    receiptFormat: settings.receiptFormat,
    receiptFooter: settings.receiptFooter,
    fiscalYearStartMonth: settings.fiscalYearStartMonth,
  };
}

export function settingsErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("schema cache") || text.includes("could not find the table"))
    return "The company settings table is missing. Apply the Phase 8 migration in Supabase.";
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Only a super admin or the company owner can change company settings.";
  if (text.includes("company_settings_text_lengths"))
    return "One of the fields is too long or the company name is empty.";
  if (text.includes("not authenticated")) return "Your session expired. Sign in again.";
  return message;
}
