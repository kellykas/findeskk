/**
 * Validation for staff administration forms.
 *
 * The same rules exist in the database and in the server functions; these checks
 * only give staff fast, readable feedback before a request is sent.
 */
import { z } from "zod";
import { ROLES } from "./roles";

const displayName = z
  .string()
  .trim()
  .min(2, "Enter the employee's full name")
  .max(80, "Name can have at most 80 characters");

const roles = z.array(z.enum(ROLES)).min(1, "Select at least one role");

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Password can have at most 72 characters");

/** Creating a sign-in needs an email and an initial password. */
export const staffAccountSchema = z.object({
  displayName,
  email: z.string().trim().email("Enter a valid email address"),
  password,
  roles,
});
export type StaffAccountInput = z.infer<typeof staffAccountSchema>;

/** Editing leaves the password alone unless a new one is typed. */
export const staffUpdateSchema = z.object({
  userId: z.string().uuid(),
  displayName,
  active: z.boolean(),
  roles,
  password: password.or(z.literal("")),
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

/**
 * Renaming a branch. The name is printed on receipts, transfers and reports,
 * so it may not be blank.
 */
export const branchUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Enter the branch name")
    .max(60, "Branch name can have at most 60 characters"),
  address: z.string().trim().max(120, "Address can have at most 120 characters"),
});
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/** Trim an email and reject blanks so the UI never renders empty labels. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
