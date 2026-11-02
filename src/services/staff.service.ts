/**
 * Staff, branch and assignment data access.
 *
 * Reads and writes go through Supabase; RLS and save_staff_access() enforce
 * authorization. The pure helpers below are covered by unit tests.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ROLES, type Role } from "@/domain/roles";
import {
  normalizeEmail,
  type BranchInput,
  type BranchFormInput,
  type StaffAccessInput,
} from "@/domain/staff";

const ROLE_SET = new Set<string>(ROLES);

export interface StaffProfileRow {
  id: string;
  display_name: string;
  active: boolean;
  created_at: string;
  email?: string | null;
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

/** Group the flat rows returned by PostgREST into the staff list the UI renders. */
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
  if (text.includes("cannot change their own access")) return "You cannot change your own access.";
  if (text.includes("forbidden"))
    return "Only a super admin or company owner can change staff access.";
  if (text.includes("invalid or inactive branch"))
    return "One of the selected branches is inactive. Refresh and try again.";
  if (text.includes("staff profile not found")) return "That staff profile no longer exists.";
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

  return buildStaffMembers(profiles.data ?? [], roles.data ?? [], assignments.data ?? []);
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

export async function saveStaffAccess(input: StaffAccessInput): Promise<void> {
  const { error } = await supabase.rpc("save_staff_access", {
    _user_id: input.userId,
    _display_name: input.displayName,
    _active: input.active,
    _roles: input.roles,
    _branches: input.branchIds,
  });
  if (error) throw new Error(staffErrorMessage(error.message));
}

export async function createBranch(input: BranchInput): Promise<void> {
  const { error } = await supabase
    .from("branches")
    .insert({ code: input.code, name: input.name, address: input.address });
  if (error) throw new Error(branchErrorMessage(error));
}

export async function updateBranch(input: BranchFormInput & { id: string }): Promise<void> {
  const { error } = await supabase
    .from("branches")
    .update({ name: input.name, address: input.address, active: input.active })
    .eq("id", input.id);
  if (error) throw new Error(branchErrorMessage(error));
}

function branchErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505" || error.message.toLowerCase().includes("duplicate key"))
    return "That branch code is already in use.";
  if (error.message.toLowerCase().includes("row-level security"))
    return "Only a super admin or company owner can change branches.";
  return error.message;
}

export const staffQuery = queryOptions({
  queryKey: ["staff", "list"],
  queryFn: listStaff,
});

export const branchesQuery = queryOptions({
  queryKey: ["branches", "list"],
  queryFn: listBranches,
});
