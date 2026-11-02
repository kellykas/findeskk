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
