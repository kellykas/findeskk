-- Reference data the company controls: mobile money networks and traded currencies.
--
-- Why: networks were fixed to MTN/Airtel and currencies to a hardcoded list in
-- the interface. Both are now rows the company manages.
--
--   * A network carries the float account that funds it, so an added network
--     posts to the right wallet account instead of a guessed one.
--   * Anything already used by a transaction cannot be deleted, only
--     deactivated: history must keep resolving.
--   * Writes go through the functions below; the tables are read-only to
--     clients, so a code path cannot quietly invent a network or currency.
--
-- Foreign currency amounts stay two-decimal (numeric(20,2)) exactly as the
-- ledger stores them, which is why added currencies need no decimals setting.

CREATE TABLE IF NOT EXISTS public.momo_networks (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,20}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  float_account_code text NOT NULL REFERENCES public.accounts(code),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.momo_networks (code, name, float_account_code, sort_order)
VALUES ('mtn', 'MTN Mobile Money', '1110', 10),
       ('airtel', 'Airtel Money', '1120', 20)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fx_currencies (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$' AND code <> 'UGX'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 40),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fx_currencies (code, name, sort_order)
VALUES ('USD', 'US Dollar', 10),
       ('EUR', 'Euro', 20),
       ('GBP', 'Pound Sterling', 30),
       ('KES', 'Kenyan Shilling', 40)
ON CONFLICT (code) DO NOTHING;

-- Keep any currency that already has a published rate.
INSERT INTO public.fx_currencies (code, name)
SELECT DISTINCT currency, currency FROM public.fx_rates
ON CONFLICT (code) DO NOTHING;

-- Access helper ------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_manage_reference()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'general_manager')
$$;

REVOKE ALL ON FUNCTION private.can_manage_reference() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_reference() TO authenticated;

-- Mobile money networks: add / edit / deactivate / delete -------------------

CREATE OR REPLACE FUNCTION public.save_momo_network(
  _code text,
  _name text,
  _float_account_code text,
  _active boolean DEFAULT true,
  _sort_order integer DEFAULT 100
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.can_manage_reference() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot change mobile money networks';
  END IF;
  IF _code IS NULL OR _code !~ '^[a-z0-9_]{2,20}$' THEN
    RAISE EXCEPTION 'Use a short lowercase code such as mpesa';
  END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN
    RAISE EXCEPTION 'Give the network a name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = _float_account_code AND a.active) THEN
    RAISE EXCEPTION 'Choose an active float account';
  END IF;

  INSERT INTO public.momo_networks (code, name, float_account_code, active, sort_order)
  VALUES (_code, trim(_name), _float_account_code, coalesce(_active, true), coalesce(_sort_order, 100))
  ON CONFLICT (code) DO UPDATE
    SET name = excluded.name,
        float_account_code = excluded.float_account_code,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now();

  -- Moving a wallet to a different float account keeps history honest: closed
  -- transactions already posted against the old account and are unaffected.
END;
$$;

REVOKE ALL ON FUNCTION public.save_momo_network(text,text,text,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_momo_network(text,text,text,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_momo_network(_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.can_manage_reference() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot change mobile money networks';
  END IF;
  IF EXISTS (SELECT 1 FROM public.momo_transactions t WHERE t.network = _code) THEN
    RAISE EXCEPTION 'This network has transactions. Deactivate it instead of deleting it';
  END IF;

  DELETE FROM public.momo_networks WHERE code = _code;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_momo_network(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_momo_network(text) TO authenticated;

-- Forex currencies: add / edit / delete ------------------------------------

CREATE OR REPLACE FUNCTION public.save_fx_currency(
  _code text,
  _name text,
  _active boolean DEFAULT true,
  _sort_order integer DEFAULT 100
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _normalised text := upper(trim(coalesce(_code,'')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.can_manage_reference() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot change currencies';
  END IF;
  IF _normalised !~ '^[A-Z]{3}$' OR _normalised = 'UGX' THEN
    RAISE EXCEPTION 'Use a three letter currency code such as AED, and not the base currency';
  END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN
    RAISE EXCEPTION 'Give the currency a name';
  END IF;

  INSERT INTO public.fx_currencies (code, name, active, sort_order)
  VALUES (_normalised, trim(_name), coalesce(_active, true), coalesce(_sort_order, 100))
  ON CONFLICT (code) DO UPDATE
    SET name = excluded.name,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_fx_currency(text,text,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_fx_currency(text,text,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_fx_currency(_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _normalised text := upper(trim(coalesce(_code,'')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT private.can_manage_reference() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot change currencies';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fx_rates r WHERE r.currency = _normalised)
     OR EXISTS (SELECT 1 FROM public.fx_transactions t WHERE t.currency = _normalised) THEN
    RAISE EXCEPTION 'This currency has rates or trades. Deactivate it instead of deleting it';
  END IF;

  DELETE FROM public.fx_currencies WHERE code = _normalised;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_fx_currency(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_fx_currency(text) TO authenticated;

-- Network check on recorded transactions ------------------------------------

-- Networks are now data, so the old two-value constraint has to go.
DO $$
DECLARE
  _constraint text;
BEGIN
  SELECT c.conname INTO _constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'public.momo_transactions'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%network%'
    AND pg_get_constraintdef(c.oid) ILIKE '%mtn%';

  IF _constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.momo_transactions DROP CONSTRAINT %I', _constraint);
  END IF;
END $$;

-- Recording, now resolving the float account from momo_networks -------------

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

  IF _network IS NULL OR _network !~ '^[a-z0-9_]{2,20}$' THEN
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

  -- The network decides which wallet account holds the float.
  SELECT n.float_account_code INTO _float_code
    FROM public.momo_networks n
   WHERE n.code = _network AND n.active;
  IF _float_code IS NULL THEN
    RAISE EXCEPTION 'Unknown or inactive mobile money network';
  END IF;

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

ALTER TABLE public.momo_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momo_networks_read ON public.momo_networks;
CREATE POLICY momo_networks_read ON public.momo_networks FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

DROP POLICY IF EXISTS fx_currencies_read ON public.fx_currencies;
CREATE POLICY fx_currencies_read ON public.fx_currencies FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.momo_networks, public.fx_currencies TO authenticated;
GRANT ALL ON public.momo_networks, public.fx_currencies TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.momo_networks, public.fx_currencies FROM authenticated, anon;
