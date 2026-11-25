-- Super-admin corrections for mobile money transactions.
--
-- momo_transactions rows are immutable and posted entries are never edited, so a
-- correction is recorded the accounting way, in one transaction:
--   1. the original is reversed (mirror-image journal entry + momo_reversals row
--      naming who corrected it and why);
--   2. the corrected transaction is recorded as a new row and posting.
-- If either step fails, nothing is written: the caller keeps the original intact
-- and can retry. Only a super admin or company owner may correct, matching the
-- transactions.correct permission in the app's role matrix.
--
-- Migration: supabase/migrations/20261117120000_momo_corrections.sql

CREATE OR REPLACE FUNCTION public.correct_momo_transaction(
  _momo_id uuid,
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
  _foreign_amount numeric(20,2) DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _momo public.momo_transactions%ROWTYPE;
  _reason_text text := trim(coalesce(_reason, ''));
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT (private.has_role(_uid, 'super_admin') OR private.has_role(_uid, 'company_owner')) THEN
    RAISE EXCEPTION 'Forbidden: only a super admin can correct a transaction';
  END IF;
  IF length(_reason_text) < 4 THEN
    RAISE EXCEPTION 'Give a reason of at least 4 characters';
  END IF;
  IF length(_reason_text) > 300 THEN
    RAISE EXCEPTION 'Reason can have at most 300 characters';
  END IF;

  SELECT * INTO _momo FROM public.momo_transactions WHERE id = _momo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown mobile money transaction';
  END IF;
  IF NOT private.can_view_branch(_momo.branch_id) THEN
    RAISE EXCEPTION 'Forbidden: not assigned to this branch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.momo_reversals r WHERE r.momo_id = _momo_id) THEN
    RAISE EXCEPTION 'This transaction has already been reversed';
  END IF;

  -- Cancel the original first, then post the replacement. Both calls run inside
  -- this function's transaction: a rejected correction rolls back the reversal.
  PERFORM public.reverse_momo_transaction(_momo_id, _reason_text);

  _new_id := public.record_momo_transaction(
    _network, _type, _amount, _commission, _branch_id, _customer_id, _customer_ref,
    _network_ref, _notes, _entry_date, _idempotency_key, _currency, _foreign_amount);

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_momo_transaction(
  uuid, text, text, numeric, numeric, uuid, uuid, text, text, text, date, text, text, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_momo_transaction(
  uuid, text, text, numeric, numeric, uuid, uuid, text, text, text, date, text, text, numeric, text
) TO authenticated;
