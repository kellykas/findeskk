-- Link a correction to the transaction that replaced it.
--
-- A correction reverses the original, then posts a replacement. The replacement
-- id only exists after the reversal row is written, so momo_reversals gets a
-- nullable replacement_id that is filled exactly once, by correct_momo_transaction.
-- Every other change to a reversal row stays blocked, as before.
--
-- Plain reversals (no replacement) keep replacement_id NULL.
--
-- Migration: supabase/migrations/20261117160000_momo_reversal_replacement.sql

ALTER TABLE public.momo_reversals
  ADD COLUMN IF NOT EXISTS replacement_id uuid REFERENCES public.momo_transactions(id);

CREATE UNIQUE INDEX IF NOT EXISTS momo_reversals_replacement_idx
  ON public.momo_reversals (replacement_id)
  WHERE replacement_id IS NOT NULL;

-- Keeps the existing trigger name, so the company reset (which disables
-- momo_reversals_immutable by name) still works unchanged.
CREATE OR REPLACE FUNCTION private.block_reversal_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.replacement_id IS NULL
     AND NEW.replacement_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.momo_id = OLD.momo_id
     AND NEW.reason = OLD.reason
     AND NEW.journal_entry_id = OLD.journal_entry_id
     AND NEW.reversed_by = OLD.reversed_by
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Posted ledger entries are immutable — post a reversing entry instead';
END;
$$;

REVOKE ALL ON FUNCTION private.block_reversal_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS momo_reversals_immutable ON public.momo_reversals;
CREATE TRIGGER momo_reversals_immutable BEFORE UPDATE OR DELETE ON public.momo_reversals
  FOR EACH ROW EXECUTE FUNCTION private.block_reversal_changes();

-- Same signature as before; it now also links the reversal to its replacement.
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

  UPDATE public.momo_reversals
     SET replacement_id = _new_id
   WHERE momo_id = _momo_id;

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_momo_transaction(
  uuid, text, text, numeric, numeric, uuid, uuid, text, text, text, date, text, text, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_momo_transaction(
  uuid, text, text, numeric, numeric, uuid, uuid, text, text, text, date, text, text, numeric, text
) TO authenticated;
