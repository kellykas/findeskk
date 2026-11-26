-- Deleting a posted forex trade.
--
-- A posted trade cannot be erased: its journal entry is immutable and the
-- ledger is the record of what happened at the counter. void_fx_transaction()
-- therefore records a deletion in one transaction:
--   1. a mirror-image journal entry that cancels the original posting, dated
--      today (the deletion belongs to the period it was found in), linked by
--      journal_entries.reverses_entry_id (UNIQUE, so an entry reverses once);
--   2. an audit row in fx_deletions naming the trade, who deleted it, when and
--      why. The trade then disappears from the bureau's list, and its reversal
--      keeps the balances honest.
--
-- Only a super admin or company owner may delete, matching the
-- transactions.correct permission and amend_fx_transaction(). A branch-scoped
-- user may only delete within a branch they can see.

CREATE TABLE IF NOT EXISTS public.fx_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fx_id uuid NOT NULL UNIQUE REFERENCES public.fx_transactions(id),
  reason text NOT NULL,
  reversal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),
  deleted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_deletion_reason_valid CHECK (length(trim(reason)) BETWEEN 4 AND 300)
);

CREATE INDEX IF NOT EXISTS fx_deletions_fx_idx ON public.fx_deletions (fx_id);

-- Deletion -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.void_fx_transaction(_fx_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _trade public.fx_transactions%ROWTYPE;
  _reason_text text := trim(coalesce(_reason, ''));
  _lines jsonb;
  _reversal_entry_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT (private.has_role(_uid, 'super_admin') OR private.has_role(_uid, 'company_owner')) THEN
    RAISE EXCEPTION 'Forbidden: only a super admin can delete a transaction';
  END IF;

  SELECT * INTO _trade FROM public.fx_transactions WHERE id = _fx_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown forex transaction';
  END IF;
  IF NOT private.can_view_branch(_trade.branch_id) THEN
    RAISE EXCEPTION 'Forbidden: not assigned to this branch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fx_deletions d WHERE d.fx_id = _fx_id) THEN
    RAISE EXCEPTION 'This trade has already been deleted';
  END IF;
  IF _trade.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'This trade has no journal entry to reverse';
  END IF;
  -- A correction reverses the original too, so this also catches a trade that
  -- was already corrected rather than deleted.
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e WHERE e.reverses_entry_id = _trade.journal_entry_id
  ) THEN
    RAISE EXCEPTION 'This trade has already been reversed';
  END IF;

  IF length(_reason_text) < 4 THEN
    RAISE EXCEPTION 'Give a reason of at least 4 characters';
  END IF;
  IF length(_reason_text) > 300 THEN
    RAISE EXCEPTION 'Reason can have at most 300 characters';
  END IF;

  -- Mirror the original posting: every debit becomes a credit and vice versa,
  -- for the exact amounts that were posted.
  SELECT jsonb_agg(jsonb_build_object(
           'account_code', a.code,
           'side', CASE WHEN l.side = 'debit' THEN 'credit' ELSE 'debit' END,
           'amount', to_char(l.amount, 'FM999999999999990.00'),
           'memo', left('Deletion reversal: ' || coalesce(nullif(l.memo, ''), a.code), 120)))
    INTO _lines
  FROM public.journal_lines l
  JOIN public.accounts a ON a.id = l.account_id
  WHERE l.entry_id = _trade.journal_entry_id;

  IF _lines IS NULL THEN
    RAISE EXCEPTION 'The original journal entry has no lines';
  END IF;

  _reversal_entry_id := private.post_journal_entry_core(
    current_date,
    format('Deletion of forex %s %s %s — %s',
      _trade.type, to_char(_trade.foreign_amount, 'FM999,999,999,990.00'),
      _trade.currency, _reason_text),
    'fx_reversal', _trade.branch_id, _lines, NULL, _trade.journal_entry_id);

  INSERT INTO public.fx_deletions (fx_id, reason, reversal_entry_id, deleted_by)
  VALUES (_fx_id, _reason_text, _reversal_entry_id, _uid);

  RETURN _reversal_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_fx_transaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_fx_transaction(uuid, text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.fx_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_deletions_read ON public.fx_deletions;
CREATE POLICY fx_deletions_read ON public.fx_deletions FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.fx_transactions f
    WHERE f.id = fx_deletions.fx_id
      AND private.can_view_branch(f.branch_id)
  )
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.fx_deletions TO authenticated;
GRANT ALL ON public.fx_deletions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.fx_deletions FROM authenticated, anon;

DROP TRIGGER IF EXISTS fx_deletions_immutable ON public.fx_deletions;
CREATE TRIGGER fx_deletions_immutable BEFORE UPDATE OR DELETE ON public.fx_deletions
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
