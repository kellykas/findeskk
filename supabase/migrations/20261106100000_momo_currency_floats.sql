-- Foreign currency mobile money floats: a USD deposit is paid out of a USD float.
--
-- Why: a USD deposit used to be converted to UGX and posted against the UGX
-- float, so the USD money had no wallet of its own. Each network now has one
-- float account per traded currency. The ledger stays in UGX (the base currency)
-- and every foreign amount is valued at the published buy rate, so the USD float
-- holds the UGX value of the USD it was funded with. The transaction keeps the
-- original USD amount and rate, so the customer's amount is never lost.
--
-- UGX transactions keep posting to momo_networks.float_account_code, unchanged.

ALTER TABLE public.momo_transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'UGX',
  ADD COLUMN IF NOT EXISTS foreign_amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS rate numeric(18,6);

ALTER TABLE public.momo_transactions
  DROP CONSTRAINT IF EXISTS momo_transactions_currency_format,
  ADD CONSTRAINT momo_transactions_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  DROP CONSTRAINT IF EXISTS momo_transactions_foreign_consistent,
  ADD CONSTRAINT momo_transactions_foreign_consistent CHECK (
    (currency = 'UGX' AND foreign_amount IS NULL AND rate IS NULL)
    OR (currency <> 'UGX' AND foreign_amount > 0 AND rate > 0)
  );

-- One float account per network and foreign currency.
CREATE TABLE IF NOT EXISTS public.momo_currency_floats (
  network text NOT NULL REFERENCES public.momo_networks(code),
  currency text NOT NULL REFERENCES public.fx_currencies(code),
  float_account_code text NOT NULL UNIQUE REFERENCES public.accounts(code),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, currency)
);

ALTER TABLE public.momo_currency_floats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momo_currency_floats_read ON public.momo_currency_floats;
CREATE POLICY momo_currency_floats_read ON public.momo_currency_floats FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.momo_currency_floats TO authenticated;
GRANT ALL ON public.momo_currency_floats TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.momo_currency_floats FROM authenticated, anon;

-- Resolves (and on first use creates) the float account for a network in a currency.
-- UGX uses the network's own float account, exactly as before.
CREATE OR REPLACE FUNCTION private.momo_float_account(_network text, _currency text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _code text;
  _name text;
BEGIN
  IF _currency = 'UGX' THEN
    SELECT n.float_account_code INTO _code FROM public.momo_networks n WHERE n.code = _network;
    RETURN _code;
  END IF;

  SELECT f.float_account_code INTO _code
    FROM public.momo_currency_floats f
   WHERE f.network = _network AND f.currency = _currency;
  IF _code IS NOT NULL THEN
    RETURN _code;
  END IF;

  SELECT n.name INTO _name FROM public.momo_networks n WHERE n.code = _network;
  _code := private.create_momo_float_account(format('%s %s', _name, _currency));

  INSERT INTO public.momo_currency_floats (network, currency, float_account_code)
  VALUES (_network, _currency, _code)
  ON CONFLICT (network, currency) DO NOTHING;

  -- A concurrent first use may have created the row first; keep the stored one.
  SELECT f.float_account_code INTO _code
    FROM public.momo_currency_floats f
   WHERE f.network = _network AND f.currency = _currency;
  RETURN _code;
END;
$$;

REVOKE ALL ON FUNCTION private.momo_float_account(text, text) FROM PUBLIC, anon, authenticated;

-- Recording takes the currency. The old 11-argument signature is dropped so
-- clients cannot reach the UGX-only version by accident.
DROP FUNCTION IF EXISTS public.record_momo_transaction(text,text,numeric,numeric,uuid,uuid,text,text,text,date,text);

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
  _idempotency_key text DEFAULT NULL,
  _currency text DEFAULT 'UGX',
  _foreign_amount numeric(20,2) DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_entry_date, current_date);
  _existing uuid;
  _entry_id uuid;
  _momo_id uuid;
  _float_code text;
  _rate numeric(18,6);
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
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Unknown currency';
  END IF;
  IF _currency <> 'UGX' THEN
    IF _foreign_amount IS NULL OR _foreign_amount <= 0 THEN
      RAISE EXCEPTION 'Foreign amount must be greater than zero';
    END IF;
    SELECT r.buy_rate INTO _rate
      FROM public.fx_rates r
     WHERE r.currency = _currency AND r.effective_from <= _date
     ORDER BY r.effective_from DESC, r.created_at DESC
     LIMIT 1;
    IF _rate IS NULL THEN
      RAISE EXCEPTION 'No published rate for %', _currency;
    END IF;
    -- The ledger is UGX: the foreign amount is valued at the published buy rate.
    -- Whole shillings, as the forex ledger rounds UGX values.
    _amount := round(_foreign_amount * _rate, 0);
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
  IF _network IS NULL OR _network !~ '^[a-z0-9_]{2,20}$' THEN
    RAISE EXCEPTION 'Unknown mobile money network';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.momo_networks n WHERE n.code = _network AND n.active) THEN
    RAISE EXCEPTION 'Unknown or inactive mobile money network';
  END IF;
  -- The network and currency decide which float holds the money.
  _float_code := private.momo_float_account(_network, _currency);
  IF _float_code IS NULL THEN
    RAISE EXCEPTION 'No float account for % in %', _network, _currency;
  END IF;
  _description := format('MoMo %s %s of %s%s%s',
    _type, upper(_network), to_char(_amount, 'FM999,999,999,990.00'),
    CASE WHEN _currency = 'UGX' THEN '' ELSE format(' (%s %s)', _currency, _foreign_amount) END,
    CASE WHEN coalesce(_network_ref,'') = '' THEN '' ELSE ' ref ' || trim(_network_ref) END);
  IF _type = 'deposit' THEN
    _lines := jsonb_build_array(
      jsonb_build_object('account_code','1000','side','debit',
        'amount', to_char(_amount + _commission, 'FM999999999999990.00'), 'memo','Cash received'),
      jsonb_build_object('account_code',_float_code,'side','credit',
        'amount', to_char(_amount, 'FM999999999999990.00'), 'memo','MoMo float paid out')
    );
  ELSE
    _payout := _amount - _commission;
    _lines := jsonb_build_array(
      jsonb_build_object('account_code',_float_code,'side','debit',
        'amount', to_char(_amount, 'FM999999999999990.00'), 'memo','MoMo float received'),
      jsonb_build_object('account_code','1000','side','credit',
        'amount', to_char(_payout, 'FM999999999999990.00'), 'memo','Cash paid out')
    );
  END IF;
  IF _commission > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_code','4100','side','credit',
        'amount', to_char(_commission, 'FM999999999999990.00'), 'memo','MoMo commission'));
  END IF;

  _entry_id := private.post_journal_entry_core(
    _date, _description, 'momo_' || _type, _branch_id, _lines, _idempotency_key, NULL);

  INSERT INTO public.momo_transactions
    (network, type, amount, commission, branch_id, customer_id, customer_ref,
     network_ref, notes, entry_date, journal_entry_id, idempotency_key, created_by,
     currency, foreign_amount, rate)
  VALUES
    (_network, _type, _amount, _commission, _branch_id, _customer_id, trim(coalesce(_customer_ref,'')),
     trim(coalesce(_network_ref,'')), trim(coalesce(_notes,'')), _date, _entry_id,
     _idempotency_key, _uid,
     _currency, CASE WHEN _currency = 'UGX' THEN NULL ELSE _foreign_amount END,
     CASE WHEN _currency = 'UGX' THEN NULL ELSE _rate END)
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

REVOKE ALL ON FUNCTION public.record_momo_transaction(text,text,numeric,numeric,uuid,uuid,text,text,text,date,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_momo_transaction(text,text,numeric,numeric,uuid,uuid,text,text,text,date,text,text,numeric) TO authenticated;
