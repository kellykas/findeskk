-- Every mobile money network gets a float account of its own when it is added.
--
-- Why: a new wallet used to be pointed at an account picked from the chart of
-- accounts, so two wallets (or a wallet and the till) could post to one balance
-- and per-network reconciliation became guesswork. Adding a network now creates
-- the asset account that holds its float, so each wallet's money is separate
-- from the first transaction.
--
-- Existing rows are untouched. Editing a network can still move it to another
-- active account, and transactions already posted stay on the account they used,
-- so history keeps resolving.
--
-- Accounts live in 1130-1990, ten apart: 1100 is the bank account and 1110/1120
-- are the seeded MTN and Airtel floats, so a generated code never collides with
-- them or with a code added later by hand.

CREATE OR REPLACE FUNCTION private.create_momo_float_account(_name text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _label text := format('Mobile money float — %s', trim(_name));
  _existing text;
  _next integer := 1130;
BEGIN
  -- Serialise allocation: two managers adding networks at the same moment must
  -- not be handed the same code.
  PERFORM pg_advisory_xact_lock(hashtext('findesk.momo_float_account'));

  -- A retried save must not leave a wallet with two float accounts.
  SELECT a.code INTO _existing
    FROM public.accounts a
   WHERE a.name = _label AND a.type = 'asset'
   ORDER BY a.code
   LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  WHILE _next < 2000 AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = _next::text) LOOP
    _next := _next + 10;
  END LOOP;
  IF _next >= 2000 THEN
    RAISE EXCEPTION 'No free float account code left. Switch off a wallet you no longer use first';
  END IF;

  INSERT INTO public.accounts (code, name, type, normal_balance, description, is_system)
  VALUES (_next::text, _label, 'asset', 'debit',
          format('%s float held at branches', trim(_name)), true);

  RETURN _next::text;
END;
$$;

REVOKE ALL ON FUNCTION private.create_momo_float_account(text) FROM PUBLIC, anon, authenticated;

-- Same signature, so existing grants stay in place. The float account is now
-- optional: leave it out and a new network gets its own.
CREATE OR REPLACE FUNCTION public.save_momo_network(
  _code text,
  _name text,
  _float_account_code text DEFAULT NULL,
  _active boolean DEFAULT true,
  _sort_order integer DEFAULT 100
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing public.momo_networks;
  _float_code text := nullif(trim(coalesce(_float_account_code, '')), '');
  _name_trim text := trim(coalesce(_name, ''));
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
  IF length(_name_trim) < 2 THEN
    RAISE EXCEPTION 'Give the network a name';
  END IF;
  IF _float_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = _float_code AND a.active) THEN
    RAISE EXCEPTION 'Choose an active float account';
  END IF;

  SELECT * INTO _existing FROM public.momo_networks n WHERE n.code = _code;
  -- Editing without naming an account keeps the one the wallet already uses.
  _float_code := coalesce(_float_code, _existing.float_account_code);
  IF _float_code IS NULL THEN
    _float_code := private.create_momo_float_account(_name_trim);
  END IF;

  INSERT INTO public.momo_networks (code, name, float_account_code, active, sort_order)
  VALUES (_code, _name_trim, _float_code, coalesce(_active, true), coalesce(_sort_order, 100))
  ON CONFLICT (code) DO UPDATE
    SET name = excluded.name,
        float_account_code = excluded.float_account_code,
        active = excluded.active,
        sort_order = excluded.sort_order,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_momo_network(text,text,text,boolean,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_momo_network(text,text,text,boolean,integer) TO authenticated;
