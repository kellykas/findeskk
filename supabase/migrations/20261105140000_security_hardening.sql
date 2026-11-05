-- Security hardening.
--
-- 1. A new sign-in now starts inactive. The profile trigger creates a row for
--    every auth user, including a self-service sign-up if email signup is ever
--    left enabled, and an active profile can read exchange rates, accounts and
--    branding through RLS. Administrators now activate staff explicitly.
-- 2. The one-time bootstrap still works: while the company has no roles at all
--    the claim activates its own profile as part of granting super_admin.
-- 3. public.has_role was reachable over the REST API by any signed-in user, so
--    one employee could ask whether a colleague holds a given role. Policies
--    call private.has_role, so the API-facing wrapper can be closed.

ALTER TABLE public.profiles ALTER COLUMN active SET DEFAULT false;

CREATE OR REPLACE FUNCTION private.claim_initial_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_roles boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('findesk.claim_initial_admin'));

  SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO _has_roles;
  IF _has_roles THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid) THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  UPDATE public.profiles SET active = true WHERE id = _uid AND NOT active;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.claim_initial_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.claim_initial_admin() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
