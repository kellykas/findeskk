-- Customers: real customer records with restricted personal data access.
--
-- Rules enforced here, not in the UI:
--   * Personal data (phone, email, identification) is readable only by roles
--     with customer duties. Auditors and staff without customer duties cannot
--     see it, even though the frontend also hides the screen from them.
--   * Records are never deleted: deactivate instead, so any transaction that
--     referenced a customer stays intact.
--   * The role checks mirror the frontend permission matrix; the frontend
--     check alone is cosmetic.

CREATE SEQUENCE IF NOT EXISTS public.customer_code_seq START 1;
REVOKE ALL ON SEQUENCE public.customer_code_seq FROM PUBLIC, anon;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT ('CUST-' || lpad(nextval('public.customer_code_seq')::text, 5, '0')),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  id_type text NOT NULL DEFAULT ''
    CHECK (id_type IN ('', 'national_id', 'passport', 'driving_permit', 'voter_card')),
  id_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  branch_id uuid REFERENCES public.branches(id),
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_name_valid CHECK (length(trim(name)) BETWEEN 2 AND 80),
  CONSTRAINT customers_phone_valid CHECK (phone ~ '^[0-9+() -]*$'),
  CONSTRAINT customers_lengths_valid CHECK (
    length(email) <= 120
    AND length(id_number) <= 40
    AND length(notes) <= 300
  )
);

DROP TRIGGER IF EXISTS customers_updated ON public.customers;
CREATE TRIGGER customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (lower(name));
CREATE INDEX IF NOT EXISTS customers_branch_idx ON public.customers (branch_id);

-- Access helpers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_view_customers()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
      OR private.has_role(auth.uid(),'supervisor')
      OR private.has_role(auth.uid(),'forex_teller')
      OR private.has_role(auth.uid(),'mobile_money_teller')
      OR private.has_role(auth.uid(),'accountant')
$$;

-- Accountants may read customer records for reporting but not create them.
CREATE OR REPLACE FUNCTION private.can_manage_customers()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
      OR private.has_role(auth.uid(),'supervisor')
      OR private.has_role(auth.uid(),'forex_teller')
      OR private.has_role(auth.uid(),'mobile_money_teller')
$$;

REVOKE ALL ON FUNCTION private.can_view_customers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_customers() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_customers() TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated USING (
  private.can_view_customers()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (
  private.can_manage_customers()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
  USING (private.can_manage_customers()) WITH CHECK (private.can_manage_customers());

-- No DELETE policy on purpose: customers are deactivated, never removed.

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
-- The code column's default runs nextval() as the inserting user.
GRANT USAGE ON SEQUENCE public.customer_code_seq TO authenticated, service_role;
GRANT ALL ON public.customers TO service_role;
REVOKE DELETE ON public.customers FROM authenticated, anon;
