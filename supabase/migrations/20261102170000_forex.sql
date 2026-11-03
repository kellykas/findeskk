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
