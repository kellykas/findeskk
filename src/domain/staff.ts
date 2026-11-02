/**
 * Validation for staff and branch administration forms.
 *
 * The same rules exist in the database; these checks only give staff fast,
 * readable feedback before a request is sent.
 */
import { z } from "zod";
import { ROLES } from "./roles";

const branchCode = z
  .string()
  .trim()
  .min(2, "Branch code needs at least 2 characters")
  .max(12, "Branch code can have at most 12 characters")
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9-]*$/.test(value), "Use letters, digits and dashes only");

export const branchInputSchema = z.object({
  code: branchCode,
  name: z
    .string()
    .trim()
    .min(2, "Branch name needs at least 2 characters")
    .max(80, "Branch name can have at most 80 characters"),
  address: z.string().trim().max(160, "Address can have at most 160 characters").default(""),
});
export type BranchInput = z.infer<typeof branchInputSchema>;

export const branchFormSchema = branchInputSchema.extend({
  active: z.boolean(),
});
export type BranchFormInput = z.infer<typeof branchFormSchema>;

export const staffAccessSchema = z.object({
  userId: z.string().uuid(),
  displayName: z
    .string()
    .trim()
    .min(2, "Full name needs at least 2 characters")
    .max(80, "Full name can have at most 80 characters"),
  active: z.boolean(),
  roles: z.array(z.enum(ROLES)).min(1, "Select at least one role"),
  branchIds: z.array(z.string().uuid()),
});
export type StaffAccessInput = z.infer<typeof staffAccessSchema>;

/** Trim an email and reject blanks so the UI never renders empty labels. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
