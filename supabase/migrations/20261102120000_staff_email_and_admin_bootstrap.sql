-- Staff email addresses (shown in the employee directory) and a one-time,
-- self-disabling way to appoint the very first administrator.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.create_staff_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data ->> 'display_name', ''), coalesce(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_profile() FROM PUBLIC, anon, authenticated;

-- Backfill accounts created before the column existed.
UPDATE public.profiles p
SET email = lower(u.email)
FROM auth.users u
WHERE p.id = u.id
  AND p.email = '';

-- Bootstrap: the first authenticated user may claim super_admin, but only while
-- the company has no roles at all. The advisory lock serialises concurrent
-- claims so two first users cannot both win.
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

  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.claim_initial_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.claim_initial_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_initial_admin()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.claim_initial_admin()
$$;

REVOKE ALL ON FUNCTION public.claim_initial_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin() TO authenticated;
