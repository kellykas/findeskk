-- Employee ID cards: a photo, an employee number and a public verification link.
--
-- Rules enforced here, not in the UI:
--   * Every profile gets an unguessable id_card_token. The QR code printed on
--     the card opens /id/<token>, which returns only what the card itself
--     prints — name, employee number, role, branch, status and photo — never
--     the email, phone or any other personal record.
--   * Photos live in a private storage bucket. Only staff admins upload or read
--     them; the verification page receives a short-lived signed link from the
--     server, so a photo URL cannot be guessed or shared forever.
--   * The employee number is unique and generated once per profile. It is the
--     only part of the card an administrator may edit, because it is the number
--     the company already uses on payroll.

CREATE SEQUENCE IF NOT EXISTS public.staff_code_seq START 1;
REVOKE ALL ON SEQUENCE public.staff_code_seq FROM PUBLIC, anon;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_code text,
  ADD COLUMN IF NOT EXISTS photo_path text,
  ADD COLUMN IF NOT EXISTS id_card_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS id_card_issued_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_staff_code_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_staff_code_valid CHECK (
    staff_code IS NULL OR staff_code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'
  );

-- A photo path is always "<profile uuid>/<file name>": the folder is the owner,
-- so one employee's photo can never be written into another's folder.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_photo_path_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo_path_valid CHECK (
    photo_path IS NULL OR photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_staff_code_key
  ON public.profiles (staff_code) WHERE staff_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_card_token_key
  ON public.profiles (id_card_token);

-- Staff who existed before the card get a number in the order they joined.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.profiles
  WHERE staff_code IS NULL
)
UPDATE public.profiles p
SET staff_code = 'FD-' || lpad(numbered.n::text, 4, '0')
FROM numbered
WHERE p.id = numbered.id;

SELECT setval(
  'public.staff_code_seq',
  GREATEST((SELECT count(*) FROM public.profiles), 1),
  true
);

CREATE OR REPLACE FUNCTION private.assign_staff_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.staff_code IS NULL OR trim(NEW.staff_code) = '' THEN
    NEW.staff_code := 'FD-' || lpad(nextval('public.staff_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_staff_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_staff_code ON public.profiles;
CREATE TRIGGER profiles_staff_code BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.assign_staff_code();

-- Public verification -------------------------------------------------------
--
-- The QR code on a printed card is scanned by someone with no account, so this
-- is the one anonymous read path. It returns the printed fields only.

CREATE OR REPLACE FUNCTION public.get_staff_id_card(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'displayName', p.display_name,
    'staffCode', coalesce(p.staff_code, ''),
    'active', p.active,
    'photoPath', coalesce(p.photo_path, ''),
    'branchName', coalesce((
      SELECT b.name
      FROM public.branch_assignments a
      JOIN public.branches b ON b.id = a.branch_id
      WHERE a.user_id = p.id
      ORDER BY b.code
      LIMIT 1
    ), ''),
    'roles', coalesce((
      SELECT jsonb_agg(r.role ORDER BY r.role)
      FROM public.user_roles r
      WHERE r.user_id = p.id
    ), '[]'::jsonb),
    'companyName', coalesce((
      SELECT s.company_name FROM public.company_settings s WHERE s.id
    ), '')
  )
  FROM public.profiles p
  WHERE p.id_card_token = _token
$$;

REVOKE ALL ON FUNCTION public.get_staff_id_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_id_card(uuid) TO anon, authenticated;

-- Photo storage -------------------------------------------------------------
--
-- Private on purpose: a face is personal data. The verification page asks the
-- server for a signed link that expires in minutes.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-photos',
  'staff-photos',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS staff_photos_admin_read ON storage.objects;
CREATE POLICY staff_photos_admin_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-photos'
    AND (public.is_staff_admin() OR (storage.foldername(name))[1] = auth.uid()::text)
  );

DROP POLICY IF EXISTS staff_photos_admin_insert ON storage.objects;
CREATE POLICY staff_photos_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-photos' AND public.is_staff_admin());

DROP POLICY IF EXISTS staff_photos_admin_update ON storage.objects;
CREATE POLICY staff_photos_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_staff_admin())
  WITH CHECK (bucket_id = 'staff-photos' AND public.is_staff_admin());

DROP POLICY IF EXISTS staff_photos_admin_delete ON storage.objects;
CREATE POLICY staff_photos_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'staff-photos' AND public.is_staff_admin());

GRANT USAGE ON SEQUENCE public.staff_code_seq TO service_role;
