-- FinDesk: everything pending after the base staff migration.
-- Generated from supabase/migrations/ in order; safe to run once in the Supabase SQL editor.
-- Not part of the migration history: `supabase db push` ignores this folder.

BEGIN;

-- ===== 20261102120000_staff_email_and_admin_bootstrap.sql =====
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

-- ===== 20261102130000_ledger_engine.sql =====
-- Phase 3: double-entry ledger.
--
-- Rules enforced here, not in the UI:
--   * Every journal entry balances (debits = credits), checked in the posting
--     function and again by a deferred constraint trigger.
--   * Posted entries and lines are immutable; corrections are reversing entries.
--   * Posting requires an active staff profile with a ledger role, and branch
--     entries require a branch assignment (or a company-wide role).
--   * Clients may read balances but cannot write ledger tables directly.
--
-- The ledger is kept in the base currency (UGX). Foreign currency holdings will
-- post their base-currency value from Phase 4 onwards.

CREATE SEQUENCE IF NOT EXISTS public.journal_entry_ref_seq START 1;
REVOKE ALL ON SEQUENCE public.journal_entry_ref_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_normal_balance_matches_type CHECK (
    (type IN ('asset','expense') AND normal_balance = 'debit')
    OR (type IN ('liability','equity','income') AND normal_balance = 'credit')
  )
);

DROP TRIGGER IF EXISTS accounts_updated ON public.accounts;
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  entry_date date NOT NULL,
  description text NOT NULL,
  entry_type text NOT NULL DEFAULT 'manual',
  branch_id uuid REFERENCES public.branches(id),
  idempotency_key text UNIQUE,
  reverses_entry_id uuid UNIQUE REFERENCES public.journal_entries(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  branch_id uuid REFERENCES public.branches(id),
  side text NOT NULL CHECK (side IN ('debit','credit')),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  memo text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON public.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_branch_idx ON public.journal_entries (branch_id);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON public.journal_lines (account_id);

-- Access helpers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_post_journal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'accountant')
$$;

CREATE OR REPLACE FUNCTION private.can_view_all_branches()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
      OR private.has_role(auth.uid(),'accountant')
      OR private.has_role(auth.uid(),'auditor')
      OR private.has_role(auth.uid(),'general_manager')
$$;

CREATE OR REPLACE FUNCTION private.can_view_branch(_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.can_view_all_branches()
      OR (_branch_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.branch_assignments a
        WHERE a.branch_id = _branch_id AND a.user_id = auth.uid()
      ))
$$;

REVOKE ALL ON FUNCTION private.can_post_journal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_view_all_branches() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_view_branch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_post_journal() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_all_branches() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_branch(uuid) TO authenticated;

-- Guards -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assert_journal_entry_balanced()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _debit numeric(20,2);
  _credit numeric(20,2);
BEGIN
  SELECT coalesce(sum(amount) FILTER (WHERE side = 'debit'), 0),
         coalesce(sum(amount) FILTER (WHERE side = 'credit'), 0)
    INTO _debit, _credit
    FROM public.journal_lines WHERE entry_id = NEW.entry_id;

  IF _debit = 0 AND _credit = 0 THEN
    RAISE EXCEPTION 'Journal entry % has no value', NEW.entry_id;
  END IF;
  IF _debit <> _credit THEN
    RAISE EXCEPTION 'Journal entry % is not balanced: debits % <> credits %', NEW.entry_id, _debit, _credit;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS journal_lines_balanced ON public.journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON public.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_journal_entry_balanced();

CREATE OR REPLACE FUNCTION private.block_ledger_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Posted ledger entries are immutable — post a reversing entry instead';
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_immutable ON public.journal_entries;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
DROP TRIGGER IF EXISTS journal_lines_immutable ON public.journal_lines;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();

REVOKE ALL ON FUNCTION private.assert_journal_entry_balanced() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.block_ledger_changes() FROM PUBLIC, anon, authenticated;

-- Posting ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.post_journal_entry(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _entry_id uuid;
  _existing uuid;
  _reference text;
  _line jsonb;
  _account public.accounts;
  _debit numeric(20,2) := 0;
  _credit numeric(20,2) := 0;
  _amount numeric(20,2);
  _line_no int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_post_journal() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot post journal entries';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _entry_date IS NULL THEN
    RAISE EXCEPTION 'Entry date is required';
  END IF;
  IF _entry_date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(trim(coalesce(_description,''))) < 4 THEN
    RAISE EXCEPTION 'A description of at least 4 characters is required';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines';
  END IF;

  IF _branch_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
      RAISE EXCEPTION 'Invalid or inactive branch';
    END IF;
    IF NOT (private.is_staff_admin() OR private.has_role(_uid,'accountant')
            OR EXISTS (SELECT 1 FROM public.branch_assignments a WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
      RAISE EXCEPTION 'Not assigned to this branch';
    END IF;
  END IF;

  IF _reverses_entry_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = _reverses_entry_id) THEN
      RAISE EXCEPTION 'The entry being reversed does not exist';
    END IF;
    IF NOT private.can_view_branch((SELECT e.branch_id FROM public.journal_entries e WHERE e.id = _reverses_entry_id)) THEN
      RAISE EXCEPTION 'Forbidden: cannot reverse an entry from an unassigned branch';
    END IF;
  END IF;

  _reference := 'JV-' || to_char(_entry_date,'YYYY') || '-'
    || lpad(nextval('public.journal_entry_ref_seq')::text, 6, '0');

  INSERT INTO public.journal_entries
    (reference, entry_date, description, entry_type, branch_id, idempotency_key, reverses_entry_id, created_by)
  VALUES
    (_reference, _entry_date, trim(_description), coalesce(nullif(trim(_entry_type),''),'manual'),
     _branch_id, _idempotency_key, _reverses_entry_id, _uid)
  RETURNING id INTO _entry_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _line_no := _line_no + 1;

    IF coalesce(_line->>'side','') NOT IN ('debit','credit') THEN
      RAISE EXCEPTION 'Line % has an invalid side', _line_no;
    END IF;

    _amount := (_line->>'amount')::numeric(20,2);
    IF _amount IS NULL OR _amount <= 0 THEN
      RAISE EXCEPTION 'Line % amount must be greater than zero', _line_no;
    END IF;

    SELECT * INTO _account FROM public.accounts a
     WHERE a.active
       AND (a.code = _line->>'account_code' OR a.id::text = _line->>'account_id');
    IF _account.id IS NULL THEN
      RAISE EXCEPTION 'Line % references an unknown or inactive account', _line_no;
    END IF;

    INSERT INTO public.journal_lines (entry_id, account_id, branch_id, side, amount, memo)
    VALUES (_entry_id, _account.id, coalesce((_line->>'branch_id')::uuid, _branch_id),
            _line->>'side', _amount, coalesce(_line->>'memo',''));

    IF _line->>'side' = 'debit' THEN
      _debit := _debit + _amount;
    ELSE
      _credit := _credit + _amount;
    END IF;
  END LOOP;

  IF _debit <> _credit THEN
    RAISE EXCEPTION 'Journal entry is not balanced: debits % <> credits %', _debit, _credit;
  END IF;

  RETURN _entry_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

-- The public wrapper is SECURITY INVOKER, so the caller needs EXECUTE on the
-- implementation. The function enforces authentication, roles and branch access
-- itself, so granting it to authenticated adds no authority.
REVOKE ALL ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_journal_entry(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT private.post_journal_entry(_entry_date, _description, _entry_type, _branch_id, _lines, _idempotency_key, _reverses_entry_id)
$$;

REVOKE ALL ON FUNCTION public.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_read ON public.accounts;
CREATE POLICY accounts_read ON public.accounts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);
DROP POLICY IF EXISTS accounts_manage ON public.accounts;
CREATE POLICY accounts_manage ON public.accounts FOR INSERT TO authenticated WITH CHECK (
  private.can_post_journal()
);
DROP POLICY IF EXISTS accounts_update ON public.accounts;
CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated
  USING (private.can_post_journal()) WITH CHECK (private.can_post_journal());

DROP POLICY IF EXISTS journal_entries_read ON public.journal_entries;
CREATE POLICY journal_entries_read ON public.journal_entries FOR SELECT TO authenticated USING (
  private.can_view_branch(branch_id)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);
DROP POLICY IF EXISTS journal_lines_read ON public.journal_lines;
CREATE POLICY journal_lines_read ON public.journal_lines FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.journal_entries e
    WHERE e.id = journal_lines.entry_id AND private.can_view_branch(e.branch_id)
  )
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.accounts, public.journal_entries, public.journal_lines TO authenticated;
GRANT ALL ON public.accounts, public.journal_entries, public.journal_lines TO service_role;
-- Ledger writes happen only through post_journal_entry(); no direct inserts.
REVOKE INSERT, UPDATE, DELETE ON public.accounts, public.journal_entries, public.journal_lines FROM authenticated;

-- Derived balances ---------------------------------------------------------

CREATE OR REPLACE VIEW public.account_balances
WITH (security_invoker = true) AS
SELECT
  a.id AS account_id,
  a.code,
  a.name,
  a.type,
  a.normal_balance,
  a.active,
  coalesce(sum(l.amount) FILTER (WHERE l.side = 'debit'), 0)::numeric(20,2) AS total_debit,
  coalesce(sum(l.amount) FILTER (WHERE l.side = 'credit'), 0)::numeric(20,2) AS total_credit,
  (CASE WHEN a.normal_balance = 'debit'
        THEN coalesce(sum(l.amount) FILTER (WHERE l.side = 'debit'), 0)
           - coalesce(sum(l.amount) FILTER (WHERE l.side = 'credit'), 0)
        ELSE coalesce(sum(l.amount) FILTER (WHERE l.side = 'credit'), 0)
           - coalesce(sum(l.amount) FILTER (WHERE l.side = 'debit'), 0)
   END)::numeric(20,2) AS balance
FROM public.accounts a
LEFT JOIN public.journal_lines l ON l.account_id = a.id
GROUP BY a.id;

GRANT SELECT ON public.account_balances TO authenticated, service_role;
REVOKE ALL ON public.account_balances FROM anon;

-- Chart of accounts --------------------------------------------------------

INSERT INTO public.accounts (code, name, type, normal_balance, description, is_system) VALUES
  ('1000','Cash on hand — UGX','asset','debit','Physical cash held at branches',true),
  ('1010','Foreign currency holdings (at cost)','asset','debit','Foreign notes valued in UGX at acquisition cost',true),
  ('1100','Bank — operating account','asset','debit','Company bank account',true),
  ('1110','Mobile money float — MTN','asset','debit','MTN float held at branches',true),
  ('1120','Mobile money float — Airtel','asset','debit','Airtel float held at branches',true),
  ('1200','Teller advances and imprest','asset','debit','Cash issued to tellers and staff',true),
  ('1300','Customer receivables','asset','debit','Amounts owed to the company by customers',true),
  ('2000','Customer payables','liability','credit','Amounts owed to customers',true),
  ('2100','Accrued expenses','liability','credit','Expenses incurred but not yet paid',true),
  ('2200','Tax payable','liability','credit','Taxes collected or owed',true),
  ('3000',$$Owner's capital$$,'equity','credit','Capital contributed by the owner',true),
  ('3100','Retained earnings','equity','credit','Accumulated results of the business',true),
  ('3200','Opening balance equity','equity','credit','Used when opening balances are entered',true),
  ('4000','Forex trading income','income','credit','Margin earned on currency trades',true),
  ('4100','Mobile money commission','income','credit','Agent commission from MTN and Airtel',true),
  ('4200','Service charges','income','credit','Fees charged to customers',true),
  ('4900','Other income','income','credit','Income that does not fit another category',true),
  ('5000','Salaries and wages','expense','debit','Staff salaries and wages',true),
  ('5100','Rent','expense','debit','Premises rent',true),
  ('5200','Utilities','expense','debit','Electricity, water, internet',true),
  ('5300','Transport and fuel','expense','debit','Transport, fuel and courier costs',true),
  ('5400','Licences and regulatory fees','expense','debit','Licences, permits and regulatory fees',true),
  ('5500','Bank charges','expense','debit','Bank and mobile money charges',true),
  ('5600','Cash shortages','expense','debit','Reconciled cash shortages',true),
  ('5900','Miscellaneous expenses','expense','debit','Small or one-off expenses',true)
ON CONFLICT (code) DO NOTHING;

-- ===== 20261102150000_customers.sql =====
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

-- ===== 20261102155000_posting_core.sql =====
-- Split journal posting mechanics from authorization.
--
-- private.post_journal_entry() refuses anyone without a general ledger-posting
-- role (super admin, owner, accountant). Operational recording functions —
-- mobile money and forex — must post entries for tellers whose roles cannot
-- post arbitrary ledger entries. So:
--
--   * private.post_journal_entry_core() holds the mechanics (validation,
--     reference generation, idempotency, line inserts, balance checks) and
--     assumes the caller has already authorized the transaction.
--   * private.post_journal_entry() keeps its public contract: same signature,
--     same checks, now delegating to core. The wrapper is what the ledger
--     screen's RPC reaches, so tellers still cannot post arbitrary entries.
--   * Operational RPCs check their own permission (can_transact_momo /
--     can_transact_forex, branch scope) and then call core directly.

CREATE OR REPLACE FUNCTION private.post_journal_entry_core(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _entry_id uuid;
  _existing uuid;
  _reference text;
  _line jsonb;
  _account public.accounts;
  _debit numeric(20,2) := 0;
  _credit numeric(20,2) := 0;
  _amount numeric(20,2);
  _line_no int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _entry_date IS NULL THEN
    RAISE EXCEPTION 'Entry date is required';
  END IF;
  IF _entry_date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(trim(coalesce(_description,''))) < 4 THEN
    RAISE EXCEPTION 'A description of at least 4 characters is required';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines';
  END IF;

  IF _branch_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
      RAISE EXCEPTION 'Invalid or inactive branch';
    END IF;
    IF NOT (private.can_view_all_branches()
            OR EXISTS (SELECT 1 FROM public.branch_assignments a WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
      RAISE EXCEPTION 'Not assigned to this branch';
    END IF;
  END IF;

  IF _reverses_entry_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = _reverses_entry_id) THEN
      RAISE EXCEPTION 'The entry being reversed does not exist';
    END IF;
    IF NOT private.can_view_branch((SELECT e.branch_id FROM public.journal_entries e WHERE e.id = _reverses_entry_id)) THEN
      RAISE EXCEPTION 'Forbidden: cannot reverse an entry from an unassigned branch';
    END IF;
  END IF;

  _reference := 'JV-' || to_char(_entry_date,'YYYY') || '-'
    || lpad(nextval('public.journal_entry_ref_seq')::text, 6, '0');

  INSERT INTO public.journal_entries
    (reference, entry_date, description, entry_type, branch_id, idempotency_key, reverses_entry_id, created_by)
  VALUES
    (_reference, _entry_date, trim(_description), coalesce(nullif(trim(_entry_type),''),'manual'),
     _branch_id, _idempotency_key, _reverses_entry_id, _uid)
  RETURNING id INTO _entry_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _line_no := _line_no + 1;

    IF coalesce(_line->>'side','') NOT IN ('debit','credit') THEN
      RAISE EXCEPTION 'Line % has an invalid side', _line_no;
    END IF;

    _amount := (_line->>'amount')::numeric(20,2);
    IF _amount IS NULL OR _amount <= 0 THEN
      RAISE EXCEPTION 'Line % amount must be greater than zero', _line_no;
    END IF;

    SELECT * INTO _account FROM public.accounts a
     WHERE a.active
       AND (a.code = _line->>'account_code' OR a.id::text = _line->>'account_id');
    IF _account.id IS NULL THEN
      RAISE EXCEPTION 'Line % references an unknown or inactive account', _line_no;
    END IF;

    INSERT INTO public.journal_lines (entry_id, account_id, branch_id, side, amount, memo)
    VALUES (_entry_id, _account.id, coalesce((_line->>'branch_id')::uuid, _branch_id),
            _line->>'side', _amount, coalesce(_line->>'memo',''));

    IF _line->>'side' = 'debit' THEN
      _debit := _debit + _amount;
    ELSE
      _credit := _credit + _amount;
    END IF;
  END LOOP;

  IF _debit <> _credit THEN
    RAISE EXCEPTION 'Journal entry is not balanced: debits % <> credits %', _debit, _credit;
  END IF;

  RETURN _entry_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

-- The mechanics are internal: only definer functions call core directly.
REVOKE ALL ON FUNCTION private.post_journal_entry_core(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The existing posting function keeps its contract and authorization, and now
-- delegates the mechanics to core.
CREATE OR REPLACE FUNCTION private.post_journal_entry(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_post_journal() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot post journal entries';
  END IF;

  RETURN private.post_journal_entry_core(
    _entry_date, _description, _entry_type, _branch_id, _lines,
    _idempotency_key, _reverses_entry_id);
END;
$$;

REVOKE ALL ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) TO authenticated;

-- ===== 20261102160000_mobile_money.sql =====
-- Mobile money: manual recording of MTN and Airtel agency transactions.
--
-- Rules enforced here, not in the UI:
--   * network_ref is typed in by staff. It is never network-verified and must
--     never be presented as if the network confirmed it.
--   * Recording posts a balanced journal entry atomically: cash and float
--     accounts move together, and commission lands in income (4100).
--   * Deposit: the customer hands over cash (amount + commission) and the
--     agent's float pays out the e-money. Withdrawal: the agent's float
--     receives the e-money and the customer is paid out (amount - commission).
--   * Rows are immutable; corrections are made by reversing the journal entry.
--   * Clients can only read; every write goes through the RPC.

CREATE TABLE IF NOT EXISTS public.momo_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN ('mtn','airtel')),
  type text NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  commission numeric(20,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_ref text NOT NULL DEFAULT '',
  network_ref text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  entry_date date NOT NULL DEFAULT current_date CHECK (entry_date <= current_date),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  idempotency_key text UNIQUE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT momo_withdrawal_commission_below_amount
    CHECK (type <> 'withdrawal' OR commission < amount),
  CONSTRAINT momo_text_lengths_valid CHECK (
    length(customer_ref) <= 80
    AND length(network_ref) <= 40
    AND length(notes) <= 300
  )
);

CREATE INDEX IF NOT EXISTS momo_transactions_branch_idx ON public.momo_transactions (branch_id);
CREATE INDEX IF NOT EXISTS momo_transactions_date_idx ON public.momo_transactions (entry_date DESC, created_at DESC);

-- Access helper ------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_transact_momo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
      OR private.has_role(auth.uid(),'supervisor')
      OR private.has_role(auth.uid(),'mobile_money_teller')
$$;

REVOKE ALL ON FUNCTION private.can_transact_momo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_transact_momo() TO authenticated;

-- Recording ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_momo_transaction(
  _network text,
  _type text,
  _amount numeric(20,2),
  _commission numeric(20,2),
  _branch_id uuid,
  _customer_id uuid DEFAULT NULL,
  _customer_ref text DEFAULT '',
  _network_ref text DEFAULT '',
  _notes text DEFAULT '',
  _entry_date date DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_entry_date, current_date);
  _existing uuid;
  _entry_id uuid;
  _momo_id uuid;
  _float_code text;
  _description text;
  _payout numeric(20,2);
  _lines jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_transact_momo() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot record mobile money transactions';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.momo_transactions WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _network IS NULL OR _network NOT IN ('mtn','airtel') THEN
    RAISE EXCEPTION 'Unknown mobile money network';
  END IF;
  IF _type IS NULL OR _type NOT IN ('deposit','withdrawal') THEN
    RAISE EXCEPTION 'Unknown transaction type';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF _commission IS NULL OR _commission < 0 THEN
    RAISE EXCEPTION 'Commission cannot be negative';
  END IF;
  IF _type = 'withdrawal' AND _commission >= _amount THEN
    RAISE EXCEPTION 'Commission must be less than the withdrawal amount';
  END IF;
  IF _date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(coalesce(_customer_ref,'')) > 80
     OR length(coalesce(_network_ref,'')) > 40
     OR length(coalesce(_notes,'')) > 300 THEN
    RAISE EXCEPTION 'One of the text fields is too long';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
    RAISE EXCEPTION 'Invalid or inactive branch';
  END IF;
  IF NOT (private.is_staff_admin() OR private.has_role(_uid,'general_manager')
          OR EXISTS (SELECT 1 FROM public.branch_assignments a WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
    RAISE EXCEPTION 'Not assigned to this branch';
  END IF;

  IF _customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id) THEN
    RAISE EXCEPTION 'Unknown customer';
  END IF;

  _float_code := CASE _network WHEN 'mtn' THEN '1110' ELSE '1120' END;
  _description := format('MoMo %s %s of %s%s',
    _type, upper(_network), to_char(_amount, 'FM999,999,999,990.00'),
    CASE WHEN coalesce(_network_ref,'') = '' THEN '' ELSE ' ref ' || trim(_network_ref) END);

  IF _type = 'deposit' THEN
    -- Customer hands over cash (amount + commission); float pays the e-money.
    _lines := jsonb_build_array(
      jsonb_build_object('account_code','1000','side','debit',
        'amount', to_char(_amount + _commission, 'FM999999999999990.00'), 'memo','Cash received'),
      jsonb_build_object('account_code',_float_code,'side','credit',
        'amount', to_char(_amount, 'FM999999999999990.00'), 'memo','MoMo float paid out')
    );
    IF _commission > 0 THEN
      _lines := _lines || jsonb_build_array(
        jsonb_build_object('account_code','4100','side','credit',
          'amount', to_char(_commission, 'FM999999999999990.00'), 'memo','MoMo commission'));
    END IF;
  ELSE
    -- Customer sends e-money; agent pays out cash minus commission.
    _payout := _amount - _commission;
    _lines := jsonb_build_array(
      jsonb_build_object('account_code',_float_code,'side','debit',
        'amount', to_char(_amount, 'FM999999999999990.00'), 'memo','MoMo float received'),
      jsonb_build_object('account_code','1000','side','credit',
        'amount', to_char(_payout, 'FM999999999999990.00'), 'memo','Cash paid out')
    );
    IF _commission > 0 THEN
      _lines := _lines || jsonb_build_array(
        jsonb_build_object('account_code','4100','side','credit',
          'amount', to_char(_commission, 'FM999999999999990.00'), 'memo','MoMo commission'));
    END IF;
  END IF;

  -- Posting core, not the public wrapper: the permission check for this
  -- transaction already happened above (can_transact_momo + branch scope).
  _entry_id := private.post_journal_entry_core(
    _date, _description, 'momo_' || _type, _branch_id, _lines, _idempotency_key, NULL);

  INSERT INTO public.momo_transactions
    (network, type, amount, commission, branch_id, customer_id, customer_ref,
     network_ref, notes, entry_date, journal_entry_id, idempotency_key, created_by)
  VALUES
    (_network, _type, _amount, _commission, _branch_id, _customer_id, trim(coalesce(_customer_ref,'')),
     trim(coalesce(_network_ref,'')), trim(coalesce(_notes,'')), _date, _entry_id,
     _idempotency_key, _uid)
  RETURNING id INTO _momo_id;

  RETURN _momo_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.momo_transactions WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_momo_transaction(text,text,numeric,numeric,uuid,uuid,text,text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_momo_transaction(text,text,numeric,numeric,uuid,uuid,text,text,text,date,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.momo_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momo_read ON public.momo_transactions;
CREATE POLICY momo_read ON public.momo_transactions FOR SELECT TO authenticated USING (
  (private.can_view_all_branches()
   OR EXISTS (
     SELECT 1 FROM public.branch_assignments a
     WHERE a.branch_id = momo_transactions.branch_id AND a.user_id = auth.uid()
   ))
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

-- No INSERT/UPDATE/DELETE policies: every write goes through
-- record_momo_transaction(), which posts the journal entry in the same
-- transaction. Recorded rows are immutable.

GRANT SELECT ON public.momo_transactions TO authenticated;
GRANT ALL ON public.momo_transactions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.momo_transactions FROM authenticated, anon;

DROP TRIGGER IF EXISTS momo_transactions_immutable ON public.momo_transactions;
CREATE TRIGGER momo_transactions_immutable BEFORE UPDATE OR DELETE ON public.momo_transactions
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();

-- ===== 20261102170000_forex.sql =====
-- Forex bureau: exchange rates and currency trades.
--
-- Rules enforced here, not in the UI:
--   * Rates are append-only history. Managers add a new rate; the latest rate
--     on or before the trade date is the one that applies. A trade posted with
--     a stale rate is rejected.
--   * Every trade posts a balanced journal entry atomically: foreign currency
--     inventory (1010) moves against cash/bank, and the margin lands in
--     income (4000). The UGX amounts are computed here from NUMERIC columns —
--     never from client arithmetic.
--   * Rows are immutable; corrections are reversing entries.
--   * Clients can only read; every write goes through the RPC (or, for rates,
--     an INSERT allowed only for rate managers).

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$' AND currency <> 'UGX'),
  buy_rate numeric(18,6) NOT NULL CHECK (buy_rate > 0 AND buy_rate < 1000000),
  sell_rate numeric(18,6) NOT NULL CHECK (sell_rate > 0 AND sell_rate < 1000000),
  effective_from date NOT NULL DEFAULT current_date,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fx_rates_latest_idx
  ON public.fx_rates (currency, effective_from DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fx_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('buy','sell')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$' AND currency <> 'UGX'),
  foreign_amount numeric(20,2) NOT NULL CHECK (foreign_amount > 0),
  rate numeric(18,6) NOT NULL CHECK (rate > 0),
  cost_rate numeric(18,6) NOT NULL CHECK (cost_rate > 0),
  ugx_amount numeric(20,2) NOT NULL CHECK (ugx_amount > 0),
  cost_amount numeric(20,2) NOT NULL CHECK (cost_amount > 0),
  margin numeric(20,2) NOT NULL,
  settlement text NOT NULL DEFAULT 'cash' CHECK (settlement IN ('cash','bank')),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  customer_ref text NOT NULL DEFAULT '',
  receipt_no text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  entry_date date NOT NULL DEFAULT current_date CHECK (entry_date <= current_date),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  idempotency_key text UNIQUE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_text_lengths_valid CHECK (
    length(customer_ref) <= 80
    AND length(receipt_no) <= 40
    AND length(notes) <= 300
  ),
  -- The stored amounts must match the amounts implied by the rates, even for
  -- a raw write that somehow bypassed the RPC.
  CONSTRAINT fx_amounts_consistent CHECK (
    ugx_amount = round(foreign_amount * rate, 0)
    AND cost_amount = round(foreign_amount * cost_rate, 0)
    AND margin = ugx_amount - cost_amount
  )
);

CREATE INDEX IF NOT EXISTS fx_transactions_branch_idx ON public.fx_transactions (branch_id);
CREATE INDEX IF NOT EXISTS fx_transactions_date_idx ON public.fx_transactions (entry_date DESC, created_at DESC);

-- Access helpers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_transact_forex()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
      OR private.has_role(auth.uid(),'supervisor')
      OR private.has_role(auth.uid(),'forex_teller')
$$;

CREATE OR REPLACE FUNCTION private.can_manage_fx_rates()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
$$;

REVOKE ALL ON FUNCTION private.can_transact_forex() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_fx_rates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_transact_forex() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_fx_rates() TO authenticated;

-- Trading ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_fx_transaction(
  _type text,
  _currency text,
  _foreign_amount numeric(20,2),
  _rate numeric(18,6),
  _cost_rate numeric(18,6),
  _settlement text,
  _branch_id uuid,
  _customer_ref text DEFAULT '',
  _receipt_no text DEFAULT '',
  _notes text DEFAULT '',
  _entry_date date DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_entry_date, current_date);
  _existing uuid;
  _entry_id uuid;
  _fx_id uuid;
  _latest_buy numeric(18,6);
  _latest_sell numeric(18,6);
  _expected numeric(18,6);
  _ugx numeric(20,2);
  _cost numeric(20,2);
  _margin numeric(20,2);
  _settlement_code text;
  _description text;
  _lines jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_transact_forex() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot record forex transactions';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.fx_transactions WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _type IS NULL OR _type NOT IN ('buy','sell') THEN
    RAISE EXCEPTION 'Unknown forex transaction type';
  END IF;
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' OR _currency = 'UGX' THEN
    RAISE EXCEPTION 'Unknown currency';
  END IF;
  IF _foreign_amount IS NULL OR _foreign_amount <= 0 THEN
    RAISE EXCEPTION 'Foreign amount must be greater than zero';
  END IF;
  IF _rate IS NULL OR _rate <= 0 OR _cost_rate IS NULL OR _cost_rate <= 0 THEN
    RAISE EXCEPTION 'Rates must be greater than zero';
  END IF;
  IF _settlement IS NULL OR _settlement NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'Settlement must be cash or bank';
  END IF;
  IF _date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(coalesce(_customer_ref,'')) > 80
     OR length(coalesce(_receipt_no,'')) > 40
     OR length(coalesce(_notes,'')) > 300 THEN
    RAISE EXCEPTION 'One of the text fields is too long';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
    RAISE EXCEPTION 'Invalid or inactive branch';
  END IF;
  IF NOT (private.is_staff_admin() OR private.has_role(_uid,'general_manager')
          OR EXISTS (SELECT 1 FROM public.branch_assignments a WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
    RAISE EXCEPTION 'Not assigned to this branch';
  END IF;

  -- The trade must use the latest published rate for its date.
  SELECT buy_rate, sell_rate INTO _latest_buy, _latest_sell
    FROM public.fx_rates
   WHERE currency = _currency AND effective_from <= _date
   ORDER BY effective_from DESC, created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No exchange rate is set for %', _currency;
  END IF;

  _expected := CASE _type WHEN 'buy' THEN _latest_buy ELSE _latest_sell END;
  IF _rate <> _expected THEN
    RAISE EXCEPTION 'The % rate for % is %, not %. Refresh the rates and try again',
      _type, _currency, _expected, _rate;
  END IF;
  IF _cost_rate <> _latest_buy THEN
    RAISE EXCEPTION 'The cost rate for % is %, not %. Refresh the rates and try again',
      _currency, _latest_buy, _cost_rate;
  END IF;

  -- Authoritative money math: NUMERIC only, rounded to whole shillings.
  _ugx := round(_foreign_amount * _rate, 0);
  _cost := round(_foreign_amount * _cost_rate, 0);
  _margin := _ugx - _cost;
  IF _ugx <= 0 OR _cost <= 0 THEN
    RAISE EXCEPTION 'The trade value rounds to zero; increase the amount';
  END IF;

  _settlement_code := CASE _settlement WHEN 'bank' THEN '1100' ELSE '1000' END;
  _description := format('Forex %s %s %s at %s UGX',
    _type, to_char(_foreign_amount, 'FM999,999,999,990.00'), _currency, _rate);

  IF _type = 'buy' THEN
    -- We buy foreign currency and pay out UGX: inventory up, cash/bank down.
    _lines := jsonb_build_array(
      jsonb_build_object('account_code','1010','side','debit',
        'amount', to_char(_cost, 'FM999999999999990.00'), 'memo','Foreign currency bought'),
      jsonb_build_object('account_code',_settlement_code,'side','credit',
        'amount', to_char(_ugx, 'FM999999999999990.00'), 'memo','UGX paid out')
    );
  ELSE
    -- We sell foreign currency and receive UGX: cash/bank up, inventory down
    -- at cost, margin to income (a negative margin debits income).
    _lines := jsonb_build_array(
      jsonb_build_object('account_code',_settlement_code,'side','debit',
        'amount', to_char(_ugx, 'FM999999999999990.00'), 'memo','UGX received'),
      jsonb_build_object('account_code','1010','side','credit',
        'amount', to_char(_cost, 'FM999999999999990.00'), 'memo','Foreign currency sold at cost')
    );
    IF _margin > 0 THEN
      _lines := _lines || jsonb_build_array(
        jsonb_build_object('account_code','4000','side','credit',
          'amount', to_char(_margin, 'FM999999999999990.00'), 'memo','Forex margin'));
    ELSIF _margin < 0 THEN
      _lines := _lines || jsonb_build_array(
        jsonb_build_object('account_code','4000','side','debit',
          'amount', to_char(-_margin, 'FM999999999999990.00'), 'memo','Forex margin (loss)'));
    END IF;
  END IF;

  -- Posting core, not the public wrapper: the permission check for this
  -- transaction already happened above (can_transact_forex + branch scope).
  _entry_id := private.post_journal_entry_core(
    _date, _description, 'forex_' || _type, _branch_id, _lines, _idempotency_key, NULL);

  INSERT INTO public.fx_transactions
    (type, currency, foreign_amount, rate, cost_rate, ugx_amount, cost_amount, margin,
     settlement, branch_id, customer_ref, receipt_no, notes, entry_date,
     journal_entry_id, idempotency_key, created_by)
  VALUES
    (_type, _currency, _foreign_amount, _rate, _cost_rate, _ugx, _cost, _margin,
     _settlement, _branch_id, trim(coalesce(_customer_ref,'')), trim(coalesce(_receipt_no,'')),
     trim(coalesce(_notes,'')), _date, _entry_id, _idempotency_key, _uid)
  RETURNING id INTO _fx_id;

  RETURN _fx_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.fx_transactions WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_fx_transaction(text,text,numeric,numeric,numeric,text,uuid,text,text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_fx_transaction(text,text,numeric,numeric,numeric,text,uuid,text,text,text,date,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_rates_read ON public.fx_rates;
CREATE POLICY fx_rates_read ON public.fx_rates FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

DROP POLICY IF EXISTS fx_rates_insert ON public.fx_rates;
CREATE POLICY fx_rates_insert ON public.fx_rates FOR INSERT TO authenticated WITH CHECK (
  private.can_manage_fx_rates()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

-- No UPDATE/DELETE policies: rates are append-only history.

DROP POLICY IF EXISTS fx_transactions_read ON public.fx_transactions;
CREATE POLICY fx_transactions_read ON public.fx_transactions FOR SELECT TO authenticated USING (
  (private.can_view_all_branches()
   OR EXISTS (
     SELECT 1 FROM public.branch_assignments a
     WHERE a.branch_id = fx_transactions.branch_id AND a.user_id = auth.uid()
   ))
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

-- No INSERT/UPDATE/DELETE policies: every trade goes through
-- record_fx_transaction(), which posts the journal entry atomically.

GRANT SELECT ON public.fx_rates, public.fx_transactions TO authenticated;
GRANT INSERT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates, public.fx_transactions TO service_role;
REVOKE UPDATE, DELETE ON public.fx_rates FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.fx_transactions FROM authenticated, anon;

DROP TRIGGER IF EXISTS fx_transactions_immutable ON public.fx_transactions;
CREATE TRIGGER fx_transactions_immutable BEFORE UPDATE OR DELETE ON public.fx_transactions
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();

-- ===== 20261102190000_settings_and_expenses.sql =====
-- Phase 8: company settings and expense recording.
--
-- Rules enforced here, not in the UI:
--   * Settings are a single row. Any active staff member may read them; only
--     super admins and the company owner may change them.
--   * An expense posts a balanced journal entry atomically: the category's
--     expense account is debited, cash or bank is credited. Amounts are NUMERIC
--     and validated here, never trusted from the client.
--   * Expense rows are immutable after posting; corrections are reversing
--     entries, exactly like every other ledger posting.

CREATE TABLE IF NOT EXISTS public.company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  company_name text NOT NULL DEFAULT 'FinDesk',
  legal_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  tax_number text NOT NULL DEFAULT '',
  base_currency text NOT NULL DEFAULT 'UGX' CHECK (base_currency ~ '^[A-Z]{3}$'),
  currency_codes text[] NOT NULL DEFAULT ARRAY['UGX','USD','EUR','GBP','KES'],
  receipt_format text NOT NULL DEFAULT '80mm' CHECK (receipt_format IN ('58mm','80mm','a4')),
  receipt_footer text NOT NULL DEFAULT '',
  fiscal_year_start_month integer NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT company_settings_text_lengths CHECK (
    length(company_name) BETWEEN 1 AND 80
    AND length(legal_name) <= 120
    AND length(address) <= 200
    AND length(phone) <= 30
    AND length(email) <= 120
    AND length(tax_number) <= 40
    AND length(receipt_footer) <= 200
    AND cardinality(currency_codes) BETWEEN 1 AND 12
  )
);

DROP TRIGGER IF EXISTS company_settings_updated ON public.company_settings;
CREATE TRIGGER company_settings_updated BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.company_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT current_date CHECK (expense_date <= current_date),
  category text NOT NULL CHECK (category IN (
    'salaries','rent','utilities','transport','licences','bank_charges','cash_shortage','misc'
  )),
  description text NOT NULL,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  paid_from text NOT NULL DEFAULT 'cash' CHECK (paid_from IN ('cash','bank')),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  idempotency_key text UNIQUE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_text_lengths_valid CHECK (
    length(description) BETWEEN 4 AND 200
    AND length(reference) <= 40
    AND length(notes) <= 300
  )
);

CREATE INDEX IF NOT EXISTS expenses_date_idx ON public.expenses (expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_branch_idx ON public.expenses (branch_id);

-- Access helpers -----------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_manage_expenses()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'accountant')
$$;

CREATE OR REPLACE FUNCTION private.can_manage_settings()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
$$;

REVOKE ALL ON FUNCTION private.can_manage_expenses() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_expenses() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_settings() TO authenticated;

-- Recording ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_expense(
  _expense_date date,
  _category text,
  _description text,
  _amount numeric(20,2),
  _paid_from text,
  _branch_id uuid,
  _reference text DEFAULT '',
  _notes text DEFAULT '',
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_expense_date, current_date);
  _existing uuid;
  _entry_id uuid;
  _expense_id uuid;
  _expense_code text;
  _payment_code text;
  _lines jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_manage_expenses() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot record expenses';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.expenses WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  _expense_code := CASE _category
    WHEN 'salaries' THEN '5000'
    WHEN 'rent' THEN '5100'
    WHEN 'utilities' THEN '5200'
    WHEN 'transport' THEN '5300'
    WHEN 'licences' THEN '5400'
    WHEN 'bank_charges' THEN '5500'
    WHEN 'cash_shortage' THEN '5600'
    WHEN 'misc' THEN '5900'
    ELSE NULL
  END;
  IF _expense_code IS NULL THEN
    RAISE EXCEPTION 'Unknown expense category';
  END IF;

  IF _paid_from IS NULL OR _paid_from NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'Expenses are paid from cash or bank';
  END IF;
  _payment_code := CASE _paid_from WHEN 'bank' THEN '1100' ELSE '1000' END;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF length(trim(coalesce(_description,''))) < 4 THEN
    RAISE EXCEPTION 'A description of at least 4 characters is required';
  END IF;
  IF length(coalesce(_reference,'')) > 40 OR length(coalesce(_notes,'')) > 300 THEN
    RAISE EXCEPTION 'One of the text fields is too long';
  END IF;
  IF _date > current_date THEN
    RAISE EXCEPTION 'Expense date cannot be in the future';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
    RAISE EXCEPTION 'Invalid or inactive branch';
  END IF;
  IF NOT (private.can_view_all_branches()
          OR EXISTS (SELECT 1 FROM public.branch_assignments a
                     WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
    RAISE EXCEPTION 'Not assigned to this branch';
  END IF;

  _lines := jsonb_build_array(
    jsonb_build_object('account_code', _expense_code, 'side', 'debit',
      'amount', to_char(_amount, 'FM999999999999990.00'), 'memo', trim(_description)),
    jsonb_build_object('account_code', _payment_code, 'side', 'credit',
      'amount', to_char(_amount, 'FM999999999999990.00'), 'memo', 'Expense paid')
  );

  -- The permission check for this transaction already ran above, so this uses
  -- the posting core rather than the arbitrary-entry wrapper.
  _entry_id := private.post_journal_entry_core(
    _date, trim(_description), 'expense', _branch_id, _lines, _idempotency_key, NULL);

  INSERT INTO public.expenses
    (expense_date, category, description, amount, paid_from, branch_id,
     reference, notes, journal_entry_id, idempotency_key, created_by)
  VALUES
    (_date, _category, trim(_description), _amount, _paid_from, _branch_id,
     trim(coalesce(_reference,'')), trim(coalesce(_notes,'')), _entry_id,
     _idempotency_key, _uid)
  RETURNING id INTO _expense_id;

  RETURN _expense_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.expenses WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_expense(date,text,text,numeric,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense(date,text,text,numeric,text,uuid,text,text,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_settings_read ON public.company_settings;
CREATE POLICY company_settings_read ON public.company_settings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

DROP POLICY IF EXISTS company_settings_update ON public.company_settings;
CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE TO authenticated
  USING (private.can_manage_settings())
  WITH CHECK (private.can_manage_settings());

-- No INSERT/DELETE policies: the settings row is seeded once by this migration.

DROP POLICY IF EXISTS expenses_read ON public.expenses;
CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated USING (
  private.can_view_branch(branch_id)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

-- No INSERT/UPDATE/DELETE policies: expenses are written only by
-- record_expense(), which posts the journal entry atomically.

GRANT SELECT ON public.company_settings TO authenticated;
GRANT UPDATE (
  company_name, legal_name, address, phone, email, tax_number,
  currency_codes, receipt_format, receipt_footer, fiscal_year_start_month
) ON public.company_settings TO authenticated;
GRANT SELECT ON public.expenses TO authenticated;
GRANT ALL ON public.company_settings, public.expenses TO service_role;

DROP TRIGGER IF EXISTS expenses_immutable ON public.expenses;
CREATE TRIGGER expenses_immutable BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();

COMMIT;
