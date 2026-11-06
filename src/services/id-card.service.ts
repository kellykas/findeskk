/**
 * Employee ID card data access.
 *
 * The photo is uploaded from the browser into a private bucket (row-level
 * security limits that to staff admins), then the server function records the
 * path and the employee number. Reading a saved photo and everything the public
 * verification page shows goes through server functions, because the bucket is
 * private and `profiles` is not readable anonymously.
 */
import { queryOptions } from "@tanstack/react-query";

import { staffPhotoError, type StaffCard } from "@/domain/idCard";
import { saveStaffCardFn, staffCardAdminFn, staffCardPublicFn } from "@/functions/staffIdCards";
import { supabase } from "@/integrations/supabase/client";
import { currentAccessToken } from "./staff.service";

const PHOTO_BUCKET = "staff-photos";

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export function idCardErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("bucket not found")) {
    return "The staff photo bucket is missing. Apply the employee ID card migration in Supabase.";
  }
  if (text.includes("could not find the function") || text.includes("schema cache")) {
    return "Employee ID cards are not set up yet. Apply the employee ID card migration in Supabase.";
  }
  if (text.includes("row-level security") || text.includes("permission denied")) {
    return "Only a super admin or the company owner can change an employee ID card.";
  }
  return message;
}

/** Uploads a photo into the employee's own folder and returns its storage path. */
export async function uploadStaffPhoto(userId: string, file: File): Promise<string> {
  const invalid = staffPhotoError(file);
  if (invalid) throw new Error(invalid);

  const path = `${userId}/${Date.now()}.${extensionFor(file.type)}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(idCardErrorMessage(error.message));
  return path;
}

export async function saveStaffCard(input: {
  userId: string;
  staffCode: string;
  photoPath: string;
  phone: string;
}): Promise<void> {
  await saveStaffCardFn({ data: { ...input, accessToken: await currentAccessToken() } });
}

export async function getStaffCardAdmin(userId: string): Promise<{
  staffCode: string;
  token: string;
  photoPath: string;
  photoUrl: string;
  phone: string;
  email: string;
}> {
  return staffCardAdminFn({ data: { userId, accessToken: await currentAccessToken() } });
}

/** Public: no session needed, which is the point of a printed QR code. */
export async function getPublicStaffCard(token: string): Promise<StaffCard | null> {
  return staffCardPublicFn({ data: { token } });
}

export const staffCardAdminQuery = (userId: string) =>
  queryOptions({
    queryKey: ["staff-card", userId],
    queryFn: () => getStaffCardAdmin(userId),
    retry: false,
  });

export const publicStaffCardQuery = (token: string) =>
  queryOptions({
    queryKey: ["staff-card", "public", token],
    queryFn: () => getPublicStaffCard(token),
    retry: false,
  });
