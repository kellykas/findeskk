-- Employee mobile money floats.
--
-- Why: an agent's e-money float sits in the network's float account, and every
-- teller was drawing on all of it. A super admin can now entrust part of that
-- float to one employee, and that employee's deposits are checked against what
-- is left. The money itself does not move: the ledger keeps posting to the
-- network's float account, so balances, reports and receipts are unchanged.
--
-- How the remaining figure works:
--   * every allocation is recorded, signed (a negative amount takes float back);
--   * a deposit reduces the employee's remaining float, a withdrawal adds to it,
--     because the wallet receives e-money back from the customer;
--   * transactions recorded before the first allocation are not charged, so
--     giving someone a float today starts from today;
--   * reversed transactions never count.
-- Only a super admin or company owner may allocate, matching the
-- floats.allocate permission in the app's role matrix. Allocations are
-- append-only, like the ledger.
--
-- Migration: supabase/migrations/20261117140000_momo_staff_floats.sql

CREATE TABLE IF NOT EXISTS public.momo_staff_floats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  network text NOT NULL REFERENCES public.momo_networks(code),
  currency text NOT NULL,
  amount numeric(20,2) NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT momo_staff_float_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT momo_staff_float_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT momo_staff_float_note_valid CHECK (length(note) <= 300)
);

CREATE INDEX IF NOT EXISTS momo_staff_floats_user_idx
  ON public.momo_staff_floats (user_id, network, currency);

ALTER TABLE public.momo_staff_floats ENABLE ROW LEVEL SECURITY;

-- An employee reads their own allocation; administrators read all of them.
DROP POLICY IF EXISTS momo_staff_floats_read ON public.momo_staff_floats;
CREATE POLICY momo_staff_floats_read ON public.momo_staff_floats FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_staff_admin());

GRANT SELECT ON public.momo_staff_floats TO authenticated;
GRANT ALL ON public.momo_staff_floats TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.momo_staff_floats FROM authenticated, anon;

DROP TRIGGER IF EXISTS momo_staff_floats_immutable ON public.momo_staff_floats;
CREATE TRIGGER momo_staff_floats_immutable BEFORE UPDATE OR DELETE ON public.momo_staff_floats
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();

-- Positions: given, used and left per employee, network and currency.
-- Security invoker, so the row-level policies above decide who sees whose float.
CREATE OR REPLACE VIEW public.momo_staff_float_positions
WITH (security_invoker = true) AS
WITH given AS (
  SELECT
    f.user_id,
    f.network,
    f.currency,
    sum(f.amount)::numeric(20,2) AS allocated,
    min(f.created_at) AS first_at
  FROM public.momo_staff_floats f
  GROUP BY f.user_id, f.network, f.currency
)
SELECT
  g.user_id,
  g.network,
  g.currency,
  g.allocated,
  coalesce(
    sum(CASE WHEN m.type = 'deposit' THEN -v.value ELSE v.value END),
    0
  )::numeric(20,2) AS movement,
  (
    g.allocated + coalesce(
      sum(CASE WHEN m.type = 'deposit' THEN -v.value ELSE v.value END),
      0
    )
  )::numeric(20,2) AS remaining
FROM given g
LEFT JOIN public.momo_transactions m
  ON m.created_by = g.user_id
 AND m.network = g.network
 AND m.currency = g.currency
 AND m.created_at >= g.first_at
 AND NOT EXISTS (SELECT 1 FROM public.momo_reversals r WHERE r.momo_id = m.id)
LEFT JOIN LATERAL (
  SELECT CASE WHEN m.currency = 'UGX' THEN m.amount ELSE m.foreign_amount END AS value
) v ON true
GROUP BY g.user_id, g.network, g.currency, g.allocated;

REVOKE ALL ON public.momo_staff_float_positions FROM anon;
GRANT SELECT ON public.momo_staff_float_positions TO authenticated, service_role;

-- What one employee has left. NULL means they were never given a float, so no
-- limit applies. SECURITY DEFINER: the check must not depend on what the caller
-- can read.
CREATE OR REPLACE FUNCTION private.momo_staff_float_remaining(
  _user_id uuid,
  _network text,
  _currency text
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.remaining
  FROM public.momo_staff_float_positions p
  WHERE p.user_id = _user_id AND p.network = _network AND p.currency = _currency
$$;

REVOKE ALL ON FUNCTION private.momo_staff_float_remaining(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- A deposit may never pay out more than the employee has left.
CREATE OR REPLACE FUNCTION private.enforce_momo_staff_float()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _remaining numeric;
  _requested numeric;
BEGIN
  IF NEW.type <> 'deposit' OR NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;
  _remaining := private.momo_staff_float_remaining(NEW.created_by, NEW.network, NEW.currency);
  IF _remaining IS NULL THEN
    RETURN NEW;
  END IF;
  _requested := CASE WHEN NEW.currency = 'UGX' THEN NEW.amount ELSE NEW.foreign_amount END;
  IF _requested > _remaining THEN
    RAISE EXCEPTION 'That deposit is more than the float left on this wallet: % % remaining',
      to_char(_remaining, 'FM999,999,990.00'), NEW.currency;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_momo_staff_float() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS momo_transactions_staff_float ON public.momo_transactions;
CREATE TRIGGER momo_transactions_staff_float BEFORE INSERT ON public.momo_transactions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_momo_staff_float();

-- Allocating and taking back ------------------------------------------------

CREATE OR REPLACE FUNCTION public.allocate_momo_staff_float(
  _user_id uuid,
  _network text,
  _currency text,
  _amount numeric(20,2),
  _note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _remaining numeric;
  _note_text text := trim(coalesce(_note, ''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT (private.has_role(_uid, 'super_admin') OR private.has_role(_uid, 'company_owner')) THEN
    RAISE EXCEPTION 'Forbidden: only a super admin can give a float';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.active) THEN
    RAISE EXCEPTION 'Unknown staff profile';
  END IF;
  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Unknown currency';
  END IF;
  IF _currency <> 'UGX'
     AND NOT EXISTS (SELECT 1 FROM public.fx_currencies c WHERE c.code = _currency) THEN
    RAISE EXCEPTION 'Unknown currency';
  END IF;
  IF _network IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.momo_networks n WHERE n.code = _network AND n.active) THEN
    RAISE EXCEPTION 'Unknown or inactive mobile money network';
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'Enter a float amount';
  END IF;
  IF length(_note_text) > 300 THEN
    RAISE EXCEPTION 'Note can have at most 300 characters';
  END IF;

  INSERT INTO public.momo_staff_floats (user_id, network, currency, amount, note, created_by)
  VALUES (_user_id, _network, _currency, _amount, _note_text, _uid)
  RETURNING id INTO _id;

  -- Taking float back must not leave the employee owing more than they hold.
  _remaining := private.momo_staff_float_remaining(_user_id, _network, _currency);
  IF _remaining < 0 THEN
    RAISE EXCEPTION 'That takes back more float than the employee has left';
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_momo_staff_float(uuid, text, text, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_momo_staff_float(uuid, text, text, numeric, text)
  TO authenticated;
