/**
 * Staff data access.
 *
 * Reads are branch- and role-scoped by RLS. Account writes go through server
 * functions, because creating or deleting a sign-in needs the service role.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROLES, type Role } from "@/domain/roles";
import type { StaffAccountInput, StaffUpdateInput } from "@/domain/staff";
import {
  createStaffAccountFn,
  deleteStaffAccountFn,
  updateStaffAccountFn,
} from "@/functions/staffAccounts";

export interface StaffProfileRow {
  id: string;
  display_name: string;
  email: string | null;
  active: boolean;
  created_at: string;
}

export interface StaffMember {
  id: string;
  displayName: string;
  email: string | null;
  active: boolean;
  roles: Role[];
  branchIds: string[];
  createdAt: string;
}

export interface BranchRecord {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
  createdAt: string;
  staffCount: number;
}

interface RoleRow {
  user_id: string;
  role: string;
}

interface AssignmentRow {
  user_id: string;
  branch_id: string;
}

const ROLE_SET = new Set<string>(ROLES);

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function buildStaffMembers(
  profiles: StaffProfileRow[],
  roles: RoleRow[],
  assignments: AssignmentRow[],
): StaffMember[] {
  const rolesByUser = new Map<string, Role[]>();
  for (const row of roles) {
    if (!ROLE_SET.has(row.role)) continue;
    const list = rolesByUser.get(row.user_id) ?? [];
    list.push(row.role as Role);
    rolesByUser.set(row.user_id, list);
  }

  const branchesByUser = new Map<string, string[]>();
  for (const row of assignments) {
    const list = branchesByUser.get(row.user_id) ?? [];
    list.push(row.branch_id);
    branchesByUser.set(row.user_id, list);
  }

  return profiles
    .map((profile) => ({
      id: profile.id,
      displayName:
        profile.display_name.trim() || (normalizeEmail(profile.email) ?? "Unnamed staff"),
      email: normalizeEmail(profile.email),
      active: profile.active,
      roles: [...new Set(rolesByUser.get(profile.id) ?? [])].sort(
        (a, b) => ROLES.indexOf(a) - ROLES.indexOf(b),
      ),
      branchIds: [...new Set(branchesByUser.get(profile.id) ?? [])].sort(),
      createdAt: profile.created_at,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function staffErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("only a super admin") || text.includes("forbidden")) {
    return "Only a super admin or company owner can manage employee accounts.";
  }
  if (text.includes("already exists")) return "An employee with that email already exists.";
  if (text.includes("at least one administrator")) {
    return "The company needs at least one administrator. Appoint another first.";
  }
  if (text.includes("your own")) return "You cannot change or delete your own account here.";
  if (text.includes("staff profile not found")) return "That staff profile no longer exists.";
  if (text.includes("unauthorized")) return "Your session expired. Sign in again.";
  return message;
}

export async function listStaff(): Promise<StaffMember[]> {
  const [profiles, roles, assignments] = await Promise.all([
    supabase.from("profiles").select("*").order("display_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("branch_assignments").select("user_id, branch_id"),
  ]);

  const failure = [profiles.error, roles.error, assignments.error].find((error) => error !== null);
  if (failure) throw new Error(failure.message);

  return buildStaffMembers(
    (profiles.data ?? []) as unknown as StaffProfileRow[],
    (roles.data ?? []) as unknown as RoleRow[],
    (assignments.data ?? []) as unknown as AssignmentRow[],
  );
}

export async function listBranches(): Promise<BranchRecord[]> {
  const [branches, assignments] = await Promise.all([
    supabase.from("branches").select("*").order("code"),
    supabase.from("branch_assignments").select("branch_id"),
  ]);

  if (branches.error) throw new Error(branches.error.message);
  if (assignments.error) throw new Error(assignments.error.message);

  const counts = new Map<string, number>();
  for (const row of assignments.data ?? []) {
    counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
  }

  return (branches.data ?? []).map((branch) => ({
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address,
    active: branch.active,
    createdAt: branch.created_at,
    staffCount: counts.get(branch.id) ?? 0,
  }));
}

/**
 * The access token for server functions. The browser session lives in local
 * storage, and framework server-function calls carry no Authorization header,
 * so the token is sent with the payload and verified on the server.
 */
async function currentAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const existing = data.session?.access_token ?? "";
  if (existing) return existing;

  const refreshed = await supabase.auth.refreshSession();
  const token = refreshed.data.session?.access_token ?? "";
  if (!token) throw new Error("Unauthorized: your session expired. Sign in again.");
  return token;
}

export async function createStaffAccount(input: StaffAccountInput): Promise<void> {
  await createStaffAccountFn({ data: { ...input, accessToken: await currentAccessToken() } });
}

export async function updateStaffAccount(input: StaffUpdateInput): Promise<void> {
  await updateStaffAccountFn({ data: { ...input, accessToken: await currentAccessToken() } });
}

export async function deleteStaffAccount(userId: string): Promise<void> {
  await deleteStaffAccountFn({ data: { userId, accessToken: await currentAccessToken() } });
}

export const staffQuery = queryOptions({
  queryKey: ["staff", "list"],
  queryFn: listStaff,
});

export const branchesQuery = queryOptions({
  queryKey: ["branches", "list"],
  queryFn: listBranches,
});
