/**
 * Employee account administration.
 *
 * Runs on the server because creating, renaming or deleting a sign-in requires
 * the Supabase service role, which must never reach the browser. Every handler
 * first proves the caller is a staff admin using their own token, and only then
 * uses the service client — so a normal employee cannot call these by hand.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { ROLES, type Role } from "@/domain/roles";

const ROLE_SET = new Set<string>(ROLES);
const MIN_PASSWORD = 8;

interface AuthContext {
  supabase: SupabaseClient<Database>;
  userId: string;
}

async function assertStaffAdmin(context: AuthContext): Promise<void> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);

  if (error) throw new Error(error.message);

  const roles = ((data ?? []) as { role: string }[]).map((row) => row.role);
  if (!roles.includes("super_admin") && !roles.includes("company_owner")) {
    throw new Error("Only a super admin or the company owner can manage employee accounts.");
  }
}

function readText(value: unknown, max: number): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function readRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return [];
  const roles = [...new Set(value.filter((role): role is string => typeof role === "string"))];
  if (roles.length === 0 || roles.some((role) => !ROLE_SET.has(role))) {
    throw new Error("Select at least one valid role.");
  }
  return roles as Role[];
}

function readPassword(value: unknown, required: boolean): string | null {
  const password = typeof value === "string" ? value : "";
  if (!password) {
    if (required) throw new Error(`Set a password of at least ${MIN_PASSWORD} characters.`);
    return null;
  }
  if (password.length < MIN_PASSWORD) {
    throw new Error(`Password must be at least ${MIN_PASSWORD} characters.`);
  }
  return password;
}

function readEmail(value: unknown): string {
  const email = readText(value, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

/** Postgres refuses to delete a user who is referenced by ledger history. */
function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("already been registered") || text.includes("already exists")) {
    return "An employee with that email already exists.";
  }
  if (text.includes("foreign key") || text.includes("violates")) {
    return "This employee is referenced by ledger history. Deactivate the account instead of deleting it.";
  }
  return message;
}

async function assignSingleBranch(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // One company, one branch: everyone is scoped to it, so there is nothing for
  // an administrator to choose.
  const { data: branch } = await supabaseAdmin
    .from("branches")
    .select("id")
    .eq("active", true)
    .order("code")
    .limit(1)
    .maybeSingle();

  await supabaseAdmin.from("branch_assignments").delete().eq("user_id", userId);
  if (branch) {
    await supabaseAdmin
      .from("branch_assignments")
      .insert({ user_id: userId, branch_id: branch.id });
  }
}

async function staffAdminCount(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .in("role", ["super_admin", "company_owner"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const createStaffAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      displayName: readText(record["displayName"], 80),
      email: readEmail(record["email"]),
      password: readPassword(record["password"], true) as string,
      roles: readRoles(record["roles"]),
    };
  })
  .handler(async ({ data, context }): Promise<{ userId: string }> => {
    await assertStaffAdmin(context as unknown as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.displayName.length < 2) throw new Error("Enter the employee's full name.");

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (created.error || !created.data.user) {
      throw new Error(friendlyAuthError(created.error?.message ?? "Could not create the account."));
    }

    const userId = created.data.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, display_name: data.displayName, email: data.email, active: true },
        { onConflict: "id" },
      );

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: userId, role })));

    await assignSingleBranch(userId);

    return { userId };
  });

export const updateStaffAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return {
      userId: String(record["userId"] ?? ""),
      displayName: readText(record["displayName"], 80),
      active: Boolean(record["active"]),
      roles: readRoles(record["roles"]),
      password: readPassword(record["password"], false),
    };
  })
  .handler(async ({ data, context }): Promise<void> => {
    await assertStaffAdmin(context as unknown as AuthContext);
    if (!data.userId) throw new Error("Choose an employee.");
    if (data.displayName.length < 2) throw new Error("Enter the employee's full name.");

    const isSelf = data.userId === context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: currentRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (roleError) throw new Error(roleError.message);

    const wasAdmin = (currentRoles ?? []).some(
      (row) => row.role === "super_admin" || row.role === "company_owner",
    );
    const staysAdmin = data.roles.some(
      (role) => role === "super_admin" || role === "company_owner",
    );

    if (isSelf && (!data.active || !staysAdmin)) {
      throw new Error("You cannot deactivate yourself or remove your own administrator role.");
    }
    if (wasAdmin && !staysAdmin && (await staffAdminCount()) <= 1) {
      throw new Error("The company needs at least one administrator. Appoint another first.");
    }

    if (data.password) {
      const updated = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (updated.error) throw new Error(friendlyAuthError(updated.error.message));
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ display_name: data.displayName, active: data.active })
      .eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: data.userId, role })));

    await assignSingleBranch(data.userId);
  });

export const deleteStaffAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const record = (input ?? {}) as Record<string, unknown>;
    return { userId: String(record["userId"] ?? "") };
  })
  .handler(async ({ data, context }): Promise<void> => {
    await assertStaffAdmin(context as unknown as AuthContext);
    if (!data.userId) throw new Error("Choose an employee.");
    if (data.userId === context.userId) throw new Error("You cannot delete your own account.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: currentRoles, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (roleError) throw new Error(roleError.message);

    const wasAdmin = (currentRoles ?? []).some(
      (row) => row.role === "super_admin" || row.role === "company_owner",
    );
    if (wasAdmin && (await staffAdminCount()) <= 1) {
      throw new Error("The company needs at least one administrator. Appoint another first.");
    }

    // Remove the access rows first: a sign-in with no profile is worse than none.
    await supabaseAdmin.from("branch_assignments").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);

    const removed = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (removed.error) throw new Error(friendlyAuthError(removed.error.message));
  });
