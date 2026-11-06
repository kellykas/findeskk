/**
 * Employee ID cards: the photo, the employee number and the public QR lookup.
 *
 * Writes need the service role because `profiles` is not writable from the
 * browser and the photo bucket is private. The public lookup is the only
 * anonymous path; it returns exactly what the card prints and nothing else.
 */
import { createServerFn } from "@tanstack/react-start";

import { ROLES, type Role } from "@/domain/roles";
import { normalizeStaffCode, STAFF_CODE_PATTERN, type StaffCard } from "@/domain/idCard";
import { assertStaffAdmin, requireCaller } from "./staffAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_SET = new Set<string>(ROLES);
const PHOTO_TTL_SECONDS = 600;
const PHOTO_BUCKET = "staff-photos";
const PHONE_PATTERN = /^[0-9+() /,-]{1,40}$/;

function readToken(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((role): role is string => typeof role === "string" && ROLE_SET.has(role)),
    ),
  ] as Role[];
}

/**
 * A missing object is not a reason to hide the card: the page falls back to the
 * employee's initials. Signing happens here so the bucket can stay private.
 */
async function signPhoto(path: string): Promise<string> {
  if (!path) return "";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, PHOTO_TTL_SECONDS);
  return error ? "" : (data?.signedUrl ?? "");
}

function readStaffCode(value: unknown): string {
  const code = normalizeStaffCode(str(value));
  if (!STAFF_CODE_PATTERN.test(code)) {
    throw new Error("Use 2–20 letters, digits or dashes for the employee number.");
  }
  return code;
}

/** Saves the photo path and employee number for one profile. Staff admins only. */
export const saveStaffCardFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      accessToken: readToken(record["accessToken"]),
      userId: str(record["userId"]).trim(),
      staffCode: str(record["staffCode"]),
      photoPath: str(record["photoPath"]).trim(),
      phone: str(record["phone"]).trim(),
    };
  })
  .handler(async ({ data }): Promise<void> => {
    const caller = await requireCaller(data.accessToken);
    await assertStaffAdmin(caller);

    if (!UUID.test(data.userId)) throw new Error("Choose an employee.");
    const staffCode = readStaffCode(data.staffCode);
    if (data.phone && !PHONE_PATTERN.test(data.phone)) {
      throw new Error("Use digits, spaces and + ( ) - only for the phone number.");
    }

    // The folder is the owner: an administrator may only attach a photo that
    // belongs to this employee, never one from another profile.
    if (data.photoPath && !data.photoPath.startsWith(`${data.userId}/`)) {
      throw new Error("That photo does not belong to this employee.");
    }
    if (data.photoPath && !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,80}$/i.test(data.photoPath)) {
      throw new Error("Unsupported photo file name.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("staff_code, photo_path, phone")
      .eq("id", data.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("That employee no longer exists.");

    const photoPath = data.photoPath || existing.photo_path || null;
    const photoChanged = photoPath !== existing.photo_path;

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        staff_code: staffCode,
        photo_path: photoPath,
        phone: data.phone || null,
        // Only a card that actually changed is re-issued.
        ...(photoChanged ||
        staffCode !== existing.staff_code ||
        (data.phone || null) !== (existing.phone || null)
          ? { id_card_issued_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", data.userId);

    if (error) {
      const text = error.message.toLowerCase();
      if (text.includes("profiles_staff_code_key") || text.includes("duplicate key")) {
        throw new Error("Another employee already has that employee number.");
      }
      if (text.includes("profiles_photo_path_valid")) {
        throw new Error("That photo link is not valid.");
      }
      throw new Error(error.message);
    }
  });

/** What the administrator's dialog shows: number, token, and a signed photo link. */
export const staffCardAdminFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      accessToken: readToken(record["accessToken"]),
      userId: str(record["userId"]).trim(),
    };
  })
  .handler(
    async ({
      data,
    }): Promise<{
      staffCode: string;
      token: string;
      photoPath: string;
      photoUrl: string;
      phone: string;
      email: string;
    }> => {
      const caller = await requireCaller(data.accessToken);
      await assertStaffAdmin(caller);
      if (!UUID.test(data.userId)) throw new Error("Choose an employee.");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("profiles")
        .select("staff_code, photo_path, id_card_token, phone, email")
        .eq("id", data.userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("That employee no longer exists.");

      return {
        staffCode: row.staff_code ?? "",
        token: row.id_card_token,
        photoPath: row.photo_path ?? "",
        photoUrl: await signPhoto(row.photo_path ?? ""),
        phone: row.phone ?? "",
        email: row.email ?? "",
      };
    },
  );

/**
 * Public lookup behind the printed QR code. Anyone holding the link sees the
 * card; the database returns only the fields the card prints.
 */
export const staffCardPublicFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    const token = readToken(record["token"]);
    if (!UUID.test(token)) throw new Error("Invalid ID card link.");
    return { token: token.toLowerCase() };
  })
  .handler(async ({ data }): Promise<StaffCard | null> => {
    // The generated Database types predate this function, so it is typed locally.
    const client = (await import("@/integrations/supabase/client.server"))
      .supabaseAdmin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data: row, error } = await client.rpc("get_staff_id_card", { _token: data.token });
    if (error) throw new Error(error.message);
    if (!row || typeof row !== "object") return null;

    const record = row as Record<string, unknown>;
    return {
      displayName: str(record["displayName"]),
      staffCode: str(record["staffCode"]),
      roles: readRoles(record["roles"]),
      branchName: str(record["branchName"]),
      active: record["active"] === true,
      companyName: str(record["companyName"]),
      email: str(record["email"]),
      phone: str(record["phone"]),
      branchAddress: str(record["branchAddress"]),
      companyAddress: str(record["companyAddress"]),
      companyPhone: str(record["companyPhone"]),
      companyEmail: str(record["companyEmail"]),
      photoUrl: await signPhoto(str(record["photoPath"])),
      token: data.token,
    };
  });
