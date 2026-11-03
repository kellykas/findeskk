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
