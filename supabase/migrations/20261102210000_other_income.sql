-- Other income: record non-automatic income (service charges, other income).
--
-- Rules enforced here, not in the UI:
--   * An income entry posts a balanced journal entry atomically: cash/bank is
--     debited and the income account is credited. Amounts are NUMERIC and
--     validated here.
--   * Income rows are immutable after posting; corrections are reversing
--     entries.
--   * Only users who can manage expenses/settings context can record income
--     (managers/accountants) - same permission set as expenses for simplicity.

CREATE TABLE IF NOT EXISTS public.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_date date NOT NULL DEFAULT current_date CHECK (income_date <= current_date),
  category text NOT NULL CHECK (category IN ('service_charges','other_income')),
  description text NOT NULL,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  received_into text NOT NULL DEFAULT 'cash' CHECK (received_into IN ('cash','bank')),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  idempotency_key text UNIQUE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incomes_text_lengths_valid CHECK (
    length(description) BETWEEN 4 AND 200
    AND length(reference) <= 40
    AND length(notes) <= 300
  )
);

CREATE INDEX IF NOT EXISTS incomes_date_idx ON public.incomes (income_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS incomes_branch_idx ON public.incomes (branch_id);

-- Recording ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_income(
  _income_date date,
  _category text,
  _description text,
  _amount numeric(20,2),
  _received_into text,
  _branch_id uuid,
  _reference text DEFAULT '',
  _notes text DEFAULT '',
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_income_date, current_date);
  _existing uuid;
  _entry_id uuid;
  _income_id uuid;
  _income_code text;
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
    RAISE EXCEPTION 'Forbidden: your roles cannot record income';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.incomes WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  _income_code := CASE _category
    WHEN 'service_charges' THEN '4200'
    WHEN 'other_income' THEN '4900'
    ELSE NULL
  END;
  IF _income_code IS NULL THEN
    RAISE EXCEPTION 'Unknown income category';
  END IF;

  IF _received_into IS NULL OR _received_into NOT IN ('cash','bank') THEN
    RAISE EXCEPTION 'Income is received into cash or bank';
  END IF;
  _payment_code := CASE _received_into WHEN 'bank' THEN '1100' ELSE '1000' END;

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
    RAISE EXCEPTION 'Income date cannot be in the future';
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
    jsonb_build_object('account_code', _payment_code, 'side', 'debit',
      'amount', to_char(_amount, 'FM999999999999990.00'), 'memo', 'Income received'),
    jsonb_build_object('account_code', _income_code, 'side', 'credit',
      'amount', to_char(_amount, 'FM999999999999990.00'), 'memo', trim(_description))
  );

  _entry_id := private.post_journal_entry_core(
    _date, trim(_description), 'income', _branch_id, _lines, _idempotency_key, NULL);

  INSERT INTO public.incomes
    (income_date, category, description, amount, received_into, branch_id,
     reference, notes, journal_entry_id, idempotency_key, created_by)
  VALUES
    (_date, _category, trim(_description), _amount, _received_into, _branch_id,
     trim(coalesce(_reference,'')), trim(coalesce(_notes,'')), _entry_id,
     _idempotency_key, _uid)
  RETURNING id INTO _income_id;

  RETURN _income_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.incomes WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_income(date,text,text,numeric,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_income(date,text,text,numeric,text,uuid,text,text,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS incomes_read ON public.incomes;
CREATE POLICY incomes_read ON public.incomes FOR SELECT TO authenticated USING (
  private.can_view_branch(branch_id)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.incomes TO authenticated;
GRANT ALL ON public.incomes TO service_role;

DROP TRIGGER IF EXISTS incomes_immutable ON public.incomes;
CREATE TRIGGER incomes_immutable BEFORE UPDATE OR DELETE ON public.incomes
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
