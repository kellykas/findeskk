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
