/**
 * Branding data access.
 *
 * Reads go through public_branding(), a security-definer function that returns
 * only the name, logo and colour, so the sign-in screen can brand itself
 * without a session. Writes happen through updateSettings() on the settings
 * row, where RLS limits them to super admins and the company owner.
 */
import { queryOptions } from "@tanstack/react-query";

import {
  DEFAULT_APP_NAME,
  DEFAULT_BRAND_COLOR,
  LOGO_MIME_TYPES,
  MAX_LOGO_BYTES,
  normalizeHex,
  type Branding,
} from "@/domain/branding";
import { supabase } from "@/integrations/supabase/client";

const LOGO_BUCKET = "branding";

interface BrandingRow {
  app_name: string | null;
  logo_url: string | null;
  theme_primary: string | null;
}

/**
 * The generated Database types predate this migration, so the RPC is called
 * through one narrow signature instead of editing generated code by hand.
 */
type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function mapBranding(row: BrandingRow | null | undefined): Branding {
  return {
    appName: row?.app_name?.trim() || DEFAULT_APP_NAME,
    logoUrl: row?.logo_url?.trim() ?? "",
    primary: normalizeHex(row?.theme_primary ?? "") ?? DEFAULT_BRAND_COLOR,
  };
}

export function brandingErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("could not find the function") || text.includes("schema cache"))
    return "Branding is not set up yet. Apply the branding migration in Supabase.";
  if (text.includes("bucket not found"))
    return "The logo storage bucket is missing. Apply the branding migration in Supabase.";
  if (text.includes("row-level security") || text.includes("permission denied"))
    return "Only a super admin or the company owner can change branding.";
  return message;
}

export async function getBranding(): Promise<Branding> {
  const rpc = supabase.rpc as unknown as UntypedRpc;
  const { data, error } = await rpc("public_branding");
  if (error) throw new Error(brandingErrorMessage(error.message));
  const rows = (data ?? []) as BrandingRow[];
  return mapBranding(rows[0]);
}

export const brandingQuery = queryOptions({
  queryKey: ["branding", "public"],
  queryFn: getBranding,
  staleTime: 5 * 60_000,
  retry: 1,
});

export function logoValidationError(file: File): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type))
    return "Use a PNG, JPEG or WebP image.";
  if (file.size > MAX_LOGO_BYTES) return "Keep the logo under 2 MB.";
  return null;
}

/** Uploads the file and returns its public URL. Visibility follows the settings row. */
export async function uploadLogo(file: File): Promise<string> {
  const invalid = logoValidationError(file);
  if (invalid) throw new Error(invalid);

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `logo-${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(brandingErrorMessage(error.message));

  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
