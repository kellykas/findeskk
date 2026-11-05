/**
 * Shared server-side checks for staff administration.
 *
 * These run only inside server functions. The caller's access token travels in
 * the payload because the browser keeps its Supabase session in local storage
 * and framework server-function calls carry no Authorization header; the token
 * is verified with Supabase, and the roles are then read with the service role,
 * so a normal employee cannot call an admin action by hand.
 */
export interface Caller {
  userId: string;
}

/** Verifies the token with Supabase; throws when it is missing or invalid. */
export async function requireCaller(accessToken: string): Promise<Caller> {
  if (!accessToken) throw new Error("Unauthorized: sign in again.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Unauthorized: your session expired. Sign in again.");
  }
  return { userId: data.user.id };
}

export async function assertStaffAdmin(caller: Caller): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.userId);

  if (error) throw new Error(error.message);

  const roles = ((data ?? []) as { role: string }[]).map((row) => row.role);
  if (!roles.includes("super_admin") && !roles.includes("company_owner")) {
    throw new Error("Only a super admin or the company owner can manage employee accounts.");
  }
}
