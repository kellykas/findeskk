-- Inter-branch currency transfers.
--
-- Moving foreign notes (or UGX cash) between branches is not a trade: the
-- company owns the money before and after, it just sits somewhere else. So the
-- entry debits the destination branch's inventory and credits the source
-- branch's inventory on the same account (1010 for foreign currency, 1000 for
-- UGX cash). Each line carries its own branch_id, which is what makes the
-- per-branch balances in the ledger move.
--
-- Rules enforced here, not in the UI:
--   * Source and destination must be different, active branches.
--   * The caller must be allowed to transfer (admin, general manager, branch
--     manager, supervisor) AND be scoped to BOTH branches — you cannot pull
--     currency out of a branch you do not work in.
--   * The journal entry is posted atomically with the transfer row.
--   * Rows are immutable; corrections are reversing entries.

CREATE TABLE IF NOT EXISTS public.currency_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  reference text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  entry_date date NOT NULL DEFAULT current_date CHECK (entry_date <= current_date),
  journal_entry_id uuid REFERENCES public.journal_entries(id),
  idempotency_key text UNIQUE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT currency_transfers_distinct_branches CHECK (from_branch_id <> to_branch_id),
  CONSTRAINT currency_transfers_text_lengths CHECK (
    length(reference) <= 40 AND length(notes) <= 300
  )
);

CREATE INDEX IF NOT EXISTS currency_transfers_date_idx
  ON public.currency_transfers (entry_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS currency_transfers_from_idx
  ON public.currency_transfers (from_branch_id);
CREATE INDEX IF NOT EXISTS currency_transfers_to_idx
  ON public.currency_transfers (to_branch_id);

-- Access helper ------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_transfer_currency()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff_admin()
      OR private.has_role(auth.uid(),'general_manager')
      OR private.has_role(auth.uid(),'branch_manager')
      OR private.has_role(auth.uid(),'supervisor')
$$;

REVOKE ALL ON FUNCTION private.can_transfer_currency() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_transfer_currency() TO authenticated;

-- Recording ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_currency_transfer(
  _currency text,
  _amount numeric(20,2),
  _from_branch_id uuid,
  _to_branch_id uuid,
  _reference text DEFAULT '',
  _notes text DEFAULT '',
  _entry_date date DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _date date := coalesce(_entry_date, current_date);
  _existing uuid;
  _transfer_id uuid;
  _entry_id uuid;
  _account_code text;
  _from_code text;
  _to_code text;
  _description text;
  _lines jsonb;
  _amount_text text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_transfer_currency() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot transfer currency between branches';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.currency_transfers WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _currency IS NULL OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Unknown currency';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF _from_branch_id IS NULL OR _to_branch_id IS NULL THEN
    RAISE EXCEPTION 'Choose both a source and a destination branch';
  END IF;
  IF _from_branch_id = _to_branch_id THEN
    RAISE EXCEPTION 'The source and destination branches must be different';
  END IF;
  IF _date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(coalesce(_reference,'')) > 40 OR length(coalesce(_notes,'')) > 300 THEN
    RAISE EXCEPTION 'One of the text fields is too long';
  END IF;

  SELECT b.code INTO _from_code FROM public.branches b
   WHERE b.id = _from_branch_id AND b.active;
  IF _from_code IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive source branch';
  END IF;
  SELECT b.code INTO _to_code FROM public.branches b
   WHERE b.id = _to_branch_id AND b.active;
  IF _to_code IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive destination branch';
  END IF;

  -- Both ends must be in scope: you can neither take from nor deliver to a
  -- branch you do not work in.
  IF NOT private.can_view_all_branches() THEN
    IF NOT EXISTS (SELECT 1 FROM public.branch_assignments a
                    WHERE a.branch_id = _from_branch_id AND a.user_id = _uid)
       OR NOT EXISTS (SELECT 1 FROM public.branch_assignments a
                       WHERE a.branch_id = _to_branch_id AND a.user_id = _uid) THEN
      RAISE EXCEPTION 'You are not assigned to both branches in this transfer';
    END IF;
  END IF;

  -- UGX cash sits in 1000; every foreign currency shares the inventory account
  -- 1010 and is separated by currency, not by account.
  _account_code := CASE WHEN _currency = 'UGX' THEN '1000' ELSE '1010' END;
  _amount_text := to_char(_amount, 'FM999999999999990.00');
  _description := format('Transfer %s %s from %s to %s',
    to_char(_amount, 'FM999,999,999,990.00'), _currency, _from_code, _to_code);

  -- Same account on both sides, different branches: the company total does not
  -- change, only where the cash sits.
  _lines := jsonb_build_array(
    jsonb_build_object('account_code',_account_code,'side','debit','amount',_amount_text,
      'memo',format('Received from %s', _from_code),'branch_id',_to_branch_id),
    jsonb_build_object('account_code',_account_code,'side','credit','amount',_amount_text,
      'memo',format('Sent to %s', _to_code),'branch_id',_from_branch_id)
  );

  _entry_id := private.post_journal_entry_core(
    _date, _description, 'transfer', NULL, _lines, _idempotency_key, NULL);

  INSERT INTO public.currency_transfers
    (currency, amount, from_branch_id, to_branch_id, reference, notes,
     entry_date, journal_entry_id, idempotency_key, created_by)
  VALUES
    (_currency, _amount, _from_branch_id, _to_branch_id,
     trim(coalesce(_reference,'')), trim(coalesce(_notes,'')),
     _date, _entry_id, _idempotency_key, _uid)
  RETURNING id INTO _transfer_id;

  RETURN _transfer_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.currency_transfers WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_currency_transfer(text,numeric,uuid,uuid,text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_currency_transfer(text,numeric,uuid,uuid,text,text,date,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.currency_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS currency_transfers_read ON public.currency_transfers;
CREATE POLICY currency_transfers_read ON public.currency_transfers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
  AND (private.can_view_branch(currency_transfers.from_branch_id)
       OR private.can_view_branch(currency_transfers.to_branch_id))
);

-- No INSERT/UPDATE/DELETE policies: every transfer goes through
-- record_currency_transfer(), which posts the journal entry atomically.

GRANT SELECT ON public.currency_transfers TO authenticated;
GRANT ALL ON public.currency_transfers TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.currency_transfers FROM authenticated, anon;

DROP TRIGGER IF EXISTS currency_transfers_immutable ON public.currency_transfers;
CREATE TRIGGER currency_transfers_immutable BEFORE UPDATE OR DELETE ON public.currency_transfers
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
