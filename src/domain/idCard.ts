/**
 * Employee ID card vocabulary: the employee number, the photo rules and the link
 * the QR code opens.
 *
 * Pure logic only — no React and no I/O — so the formatting and the limits can
 * be tested without a browser. The same rules exist in PostgreSQL as CHECK
 * constraints and in the server function; these checks only give the
 * administrator fast feedback.
 */
import { z } from "zod";

import { ROLES, ROLE_LABELS, type Role } from "./roles";

/** Raster images only: an SVG can carry script and is not a photograph. */
export const STAFF_PHOTO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_STAFF_PHOTO_BYTES = 5 * 1024 * 1024;

/** Matches profiles_staff_code_valid in the database. */
export const STAFF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,19}$/;

/** "fd 0012" and " fd-0012 " both become FD-0012, so the card always looks the same. */
export function normalizeStaffCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 20);
}

export const staffCardSchema = z.object({
  userId: z.string().uuid(),
  staffCode: z
    .string()
    .transform(normalizeStaffCode)
    .refine((value) => STAFF_CODE_PATTERN.test(value), "Use 2–20 letters, digits or dashes"),
});
export type StaffCardInput = z.infer<typeof staffCardSchema>;

export function staffPhotoError(file: { type: string; size: number }): string | null {
  if (!(STAFF_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPG, PNG or WebP photo.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_STAFF_PHOTO_BYTES) return "Keep the photo under 5 MB.";
  return null;
}

/** What the card and the public verification page both show. Nothing else. */
export interface StaffCard {
  displayName: string;
  staffCode: string;
  roles: Role[];
  branchName: string;
  active: boolean;
  companyName: string;
  /** Short-lived signed link, or an empty string when no photo is on file. */
  photoUrl: string;
  token: string;
}

/** ISO/IEC 7810 ID-1 (CR80): the size every card printer and pouch expects. */
export const ID_CARD_WIDTH_MM = 85.6;
export const ID_CARD_HEIGHT_MM = 54;

export function idCardPath(token: string): string {
  return `/id/${encodeURIComponent(token)}`;
}

/** Absolute link the QR code opens, so a printed card works away from the desk. */
export function idCardLink(token: string, origin?: string): string {
  const base = origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  return `${base}${idCardPath(token)}`;
}

export function staffInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * The most senior role, in the canonical order used everywhere else. The list
 * arrives in whatever order the database returned it, so it is sorted here
 * rather than trusting the first entry.
 */
export function primaryRoleLabel(roles: Role[]): string {
  const role = [...roles].sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b))[0];
  return role && role in ROLE_LABELS ? ROLE_LABELS[role] : "Staff";
}
