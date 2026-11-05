/**
 * Company-managed reference data: mobile money networks and traded currencies.
 *
 * The database is the authority — save_momo_network(), delete_momo_network(),
 * save_fx_currency() and delete_fx_currency() re-check every rule here. These
 * schemas only turn a mistyped form into a clear message before the round trip.
 */
import { z } from "zod";

/** Lowercase slug: it is stored on every transaction, so keep it boring. */
export const momoNetworkSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,20}$/, "Use 2–20 lowercase letters, digits or underscores, e.g. mpesa"),
  name: z
    .string()
    .trim()
    .min(2, "Give the network a name")
    .max(40, "Name can have at most 40 characters"),
  /**
   * Optional on purpose: a new network is given a dedicated float account by the
   * database, so the add form does not choose one. Editing can name another
   * active account to move the wallet.
   */
  floatAccountCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});
export type MomoNetworkForm = z.infer<typeof momoNetworkSchema>;

export const fxCurrencySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three letter code, e.g. AED")
    .refine((code) => code !== "UGX", "UGX is the base currency and is not traded against itself"),
  name: z
    .string()
    .trim()
    .min(2, "Give the currency a name")
    .max(40, "Name can have at most 40 characters"),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});
export type FxCurrencyForm = z.infer<typeof fxCurrencySchema>;

export interface MomoNetworkRecord {
  code: string;
  name: string;
  floatAccountCode: string;
  active: boolean;
  sortOrder: number;
}

export interface FxCurrencyRecord {
  code: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

/** Active networks for a recording form, in the order the company chose. */
export function activeNetworks(networks: MomoNetworkRecord[]): MomoNetworkRecord[] {
  return networks
    .filter((network) => network.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** Active currencies for a trade or rate form, in the company's order. */
export function activeCurrencies(currencies: FxCurrencyRecord[]): FxCurrencyRecord[] {
  return currencies
    .filter((currency) => currency.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

/** Display name for a stored code, falling back to the code itself. */
export function labelForCode(items: { code: string; name: string }[], code: string): string {
  return items.find((item) => item.code === code)?.name ?? code;
}
