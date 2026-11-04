/**
 * Authentication and signed-in viewer data.
 *
 * Components never touch Supabase directly: this module owns session calls,
 * profile/role/branch reads and the friendly error messages used by the UI.
 * Role checks here are cosmetic; PostgreSQL RLS decides what data is returned.
 */
import { queryOptions } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ROLES, type Role } from "@/domain/roles";
import { normalizeEmail } from "@/domain/staff";

const ROLE_SET = new Set<string>(ROLES);

export interface ViewerBranch {
  id: string;
  code: string;
  name: string;
}

export interface Viewer {
  userId: string;
  displayName: string;
  email: string | null;
  active: boolean;
  roles: Role[];
  branches: ViewerBranch[];
}

export function authErrorMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Incorrect email or password.";
  if (text.includes("email not confirmed")) return "Confirm your email address before signing in.";
  if (text.includes("too many") || text.includes("rate limit"))
    return "Too many attempts. Wait a moment and try again.";
  if (text.includes("failed to fetch") || text.includes("network"))
    return "Cannot reach the authentication service. Check your connection and try again.";
  // Reset-link and password-policy replies. Without these the user sees raw
  // Supabase wording such as "Auth session missing!", which explains nothing.
  if (
    text.includes("expired") ||
    text.includes("session missing") ||
    text.includes("token has expired")
  )
    return "That reset link has expired. Request a new one.";
  if (text.includes("should be different") || text.includes("same password"))
    return "Choose a password you have not used here before.";
  if (text.includes("password should be") || text.includes("password is too short"))
    return "Use a password with at least 8 characters.";
  return message;
}

/**
 * Where the emailed reset link returns to. Supabase ignores a `redirectTo` it
 * has not been told about, so this exact URL must be listed under
 * Authentication → URL Configuration → Redirect URLs in the Supabase dashboard.
 */
export function resetPasswordRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/reset-password`;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(authErrorMessage(error.message));
  return data.session;
}

/** Subscribe to sign-in/sign-out events; returns the unsubscribe function. */
export function onAuthStateChange(listener: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authErrorMessage(error.message));
}

/**
 * Send a reset link. Supabase answers the same way whether or not the address
 * has an account, so the screen never reveals which staff emails exist.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    origin ? { redirectTo: resetPasswordRedirectUrl(origin) } : undefined,
  );
  if (error) throw new Error(authErrorMessage(error.message));
}

/** Finish a reset: the recovery link has already signed the user in. */
export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error.message));
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorMessage(error.message));
}

/** Grant the signed-in user the first administrator role — only works while no roles exist. */
export async function claimInitialAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_initial_admin");
  if (error) throw new Error(error.message);
  return data === true;
}

export async function loadViewer(userId: string, authEmail: string | null): Promise<Viewer | null> {
  const [profileResult, rolesResult, assignmentsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("branch_assignments").select("branch_id").eq("user_id", userId),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (rolesResult.error) throw new Error(rolesResult.error.message);
  if (assignmentsResult.error) throw new Error(assignmentsResult.error.message);
  if (!profileResult.data) return null;

  // `email` is added by the latest migration; keep it optional so an older
  // database still loads the rest of the profile.
  const profile = profileResult.data as {
    display_name: string;
    active: boolean;
    email?: string | null;
  };
  const roles = (rolesResult.data ?? [])
    .map((row) => row.role)
    .filter((role): role is Role => ROLE_SET.has(role));
  const branchIds = (assignmentsResult.data ?? []).map((row) => row.branch_id);

  let branches: ViewerBranch[] = [];
  if (branchIds.length > 0) {
    const { data, error } = await supabase
      .from("branches")
      .select("id, code, name")
      .in("id", branchIds)
      .order("name");
    if (error) throw new Error(error.message);
    branches = data ?? [];
  }

  return {
    userId,
    displayName: profile.display_name.trim() || (normalizeEmail(profile.email) ?? ""),
    email: normalizeEmail(profile.email) ?? normalizeEmail(authEmail),
    active: profile.active,
    roles,
    branches,
  };
}

export function viewerQuery(userId: string, authEmail: string | null) {
  return queryOptions({
    queryKey: ["viewer", userId],
    queryFn: () => loadViewer(userId, authEmail),
    staleTime: 60_000,
  });
}
