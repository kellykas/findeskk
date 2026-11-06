-- Employee ID card contact details: a phone number per employee, and the
-- verification page reads the office contacts and branch address the card prints.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_valid CHECK (
    phone IS NULL OR (char_length(phone) <= 40 AND phone ~ '^[0-9+() /,-]*$')
  );

CREATE OR REPLACE FUNCTION public.get_staff_id_card(_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'displayName', p.display_name,
    'staffCode', coalesce(p.staff_code, ''),
    'active', p.active,
    'photoPath', coalesce(p.photo_path, ''),
    'email', coalesce(p.email, ''),
    'phone', coalesce(p.phone, ''),
    'branchName', coalesce((
      SELECT b.name FROM public.branch_assignments a
      JOIN public.branches b ON b.id = a.branch_id
      WHERE a.user_id = p.id ORDER BY b.code LIMIT 1), ''),
    'branchAddress', coalesce((
      SELECT b.address FROM public.branch_assignments a
      JOIN public.branches b ON b.id = a.branch_id
      WHERE a.user_id = p.id ORDER BY b.code LIMIT 1), ''),
    'roles', coalesce((
      SELECT jsonb_agg(r.role ORDER BY r.role) FROM public.user_roles r
      WHERE r.user_id = p.id), '[]'::jsonb),
    'companyName', coalesce((SELECT s.company_name FROM public.company_settings s WHERE s.id), ''),
    'companyAddress', coalesce((SELECT s.address FROM public.company_settings s WHERE s.id), ''),
    'companyPhone', coalesce((SELECT s.phone FROM public.company_settings s WHERE s.id), ''),
    'companyEmail', coalesce((SELECT s.email FROM public.company_settings s WHERE s.id), '')
  )
  FROM public.profiles p
  WHERE p.id_card_token = _token
$$;
REVOKE ALL ON FUNCTION public.get_staff_id_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_id_card(uuid) TO anon, authenticated;
