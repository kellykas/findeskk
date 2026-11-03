-- Authorized reversals for mobile money transactions.
--
-- momo_transactions rows are immutable: a trigger refuses updates and deletes.
-- A reversal is therefore recorded twice, permanently:
--   1. a mirror-image journal entry that cancels the original posting, linked by
--      journal_entries.reverses_entry_id (UNIQUE, so an entry reverses once);
--   2. an audit row in momo_reversals naming who reversed it, when and why.
-- Only roles holding transactions.reverse may reverse, and only within a branch
-- they can see. Nothing is deleted: the original stays for audit.

CREATE TABLE IF NOT EXISTS public.momo_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  momo_id uuid NOT NULL UNIQUE REFERENCES public.momo_transactions(id),
  reason text NOT NULL,
  journal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),
  reversed_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT momo_reversal_reason_valid CHECK (length(trim(reason)) BETWEEN 4 AND 300)
);

CREATE INDEX IF NOT EXISTS momo_reversals_momo_idx ON public.momo_reversals (momo_id);

-- Access helper ------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.can_reverse_transactions()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(),'super_admin')
      OR private.has_role(auth.uid(),'company_owner')
      OR private.has_role(auth.uid(),'general_manager')
$$;

REVOKE ALL ON FUNCTION private.can_reverse_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_reverse_transactions() TO authenticated;

-- Reversal -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_momo_transaction(_momo_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _momo public.momo_transactions%ROWTYPE;
  _lines jsonb;
  _entry_id uuid;
  _reversal_id uuid;
  _reason_text text := trim(coalesce(_reason, ''));
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_reverse_transactions() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot reverse transactions';
  END IF;

  SELECT * INTO _momo FROM public.momo_transactions WHERE id = _momo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown mobile money transaction';
  END IF;

  IF NOT private.can_view_branch(_momo.branch_id) THEN
    RAISE EXCEPTION 'Forbidden: not assigned to this branch';
  END IF;
  IF length(_reason_text) < 4 THEN
    RAISE EXCEPTION 'Give a reason of at least 4 characters';
  END IF;
  IF length(_reason_text) > 300 THEN
    RAISE EXCEPTION 'Reason can have at most 300 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.momo_reversals r WHERE r.momo_id = _momo_id) THEN
    RAISE EXCEPTION 'This transaction has already been reversed';
  END IF;
  IF _momo.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'This transaction has no journal entry to reverse';
  END IF;

  -- Mirror the original posting: every debit becomes a credit and vice versa,
  -- for the exact amounts that were posted.
  SELECT jsonb_agg(jsonb_build_object(
           'account_code', a.code,
           'side', CASE WHEN l.side = 'debit' THEN 'credit' ELSE 'debit' END,
           'amount', to_char(l.amount, 'FM999999999999990.00'),
           'memo', left('Reversal: ' || coalesce(nullif(l.memo, ''), a.code), 120)))
    INTO _lines
  FROM public.journal_lines l
  JOIN public.accounts a ON a.id = l.account_id
  WHERE l.entry_id = _momo.journal_entry_id;

  IF _lines IS NULL THEN
    RAISE EXCEPTION 'The original journal entry has no lines';
  END IF;

  -- Correct today, not in the past: the reversal belongs to the period in which
  -- the mistake was found, which is what auditors expect.
  _entry_id := private.post_journal_entry_core(
    current_date,
    format('Reversal of MoMo %s %s — %s', _momo.type, upper(_momo.network), _reason_text),
    'momo_reversal', _momo.branch_id, _lines, NULL, _momo.journal_entry_id);

  INSERT INTO public.momo_reversals (momo_id, reason, journal_entry_id, reversed_by)
  VALUES (_momo_id, _reason_text, _entry_id, _uid)
  RETURNING id INTO _reversal_id;

  RETURN _reversal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_momo_transaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_momo_transaction(uuid, text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.momo_reversals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS momo_reversals_read ON public.momo_reversals;
CREATE POLICY momo_reversals_read ON public.momo_reversals FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.momo_transactions m
    WHERE m.id = momo_reversals.momo_id
      AND private.can_view_branch(m.branch_id)
  )
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.momo_reversals TO authenticated;
GRANT ALL ON public.momo_reversals TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.momo_reversals FROM authenticated, anon;

DROP TRIGGER IF EXISTS momo_reversals_immutable ON public.momo_reversals;
CREATE TRIGGER momo_reversals_immutable BEFORE UPDATE OR DELETE ON public.momo_reversals
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
