-- Branding: the name, logo and theme colour the company sees.
--
-- Rules enforced here, not in the UI:
--   * The three branding columns live on the single company_settings row, so the
--     existing policy applies: only super admins and the company owner may
--     change them (private.can_manage_settings()).
--   * The sign-in screen must brand itself before anyone has signed in, and the
--     settings row is readable only by active staff. public_branding() therefore
--     exposes exactly the three non-sensitive branding values to anon too.
--   * Logos are uploaded to a public storage bucket, writable only by the same
--     administrators and limited to raster images, because an SVG can carry
--     script.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS app_name text NOT NULL DEFAULT 'FinDesk',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme_primary text NOT NULL DEFAULT '#7c3aed';

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_branding_valid;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_branding_valid CHECK (
    length(app_name) BETWEEN 1 AND 40
    AND length(logo_url) <= 500
    AND (logo_url = '' OR logo_url ~* '^https://')
    AND theme_primary ~ '^#[0-9a-fA-F]{6}$'
  );

-- The settings migration granted UPDATE per column; the new columns need theirs.
GRANT UPDATE (app_name, logo_url, theme_primary) ON public.company_settings TO authenticated;

-- Public branding ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_branding()
RETURNS TABLE (app_name text, logo_url text, theme_primary text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.app_name, s.logo_url, s.theme_primary
  FROM public.company_settings s
  WHERE s.id = true
$$;

REVOKE ALL ON FUNCTION public.public_branding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_branding() TO anon, authenticated;

-- Logo storage ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS branding_public_read ON storage.objects;
CREATE POLICY branding_public_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_admin_insert ON storage.objects;
CREATE POLICY branding_admin_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND private.can_manage_settings());

DROP POLICY IF EXISTS branding_admin_update ON storage.objects;
CREATE POLICY branding_admin_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND private.can_manage_settings())
  WITH CHECK (bucket_id = 'branding' AND private.can_manage_settings());

DROP POLICY IF EXISTS branding_admin_delete ON storage.objects;
CREATE POLICY branding_admin_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND private.can_manage_settings());
