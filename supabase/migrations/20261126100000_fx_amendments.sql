-- Correcting a posted forex trade.
--
-- fx_transactions rows and their journal entries are immutable, so "editing" a
-- trade cannot change history. amend_fx_transaction() therefore records a
-- correction twice, permanently, in one transaction:
--   1. a mirror-image journal entry that cancels the original posting, linked by
--      journal_entries.reverses_entry_id (UNIQUE, so an entry reverses once);
--   2. the corrected trade as a new fx_transactions row, posted through
--      record_fx_transaction() so it is priced from the published rate for its
--      date, exactly like a trade recorded from scratch;
--   3. an audit row in fx_amendments naming the original, the replacement, who
--      corrected it, when and why.
-- Only a super admin or company owner may correct, matching the
-- transactions.correct permission and correct_momo_transaction(), and only for
-- a branch they can see. Nothing is deleted: the original stays for audit.

CREATE TABLE IF NOT EXISTS public.fx_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fx_id uuid NOT NULL UNIQUE REFERENCES public.fx_transactions(id),
  replacement_id uuid NOT NULL UNIQUE REFERENCES public.fx_transactions(id),
  reason text NOT NULL,
  reversal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),
  amended_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_amendment_reason_valid CHECK (length(trim(reason)) BETWEEN 4 AND 300)
);

CREATE INDEX IF NOT EXISTS fx_amendments_fx_idx ON public.fx_amendments (fx_id);
CREATE INDEX IF NOT EXISTS fx_amendments_replacement_idx ON public.fx_amendments (replacement_id);

-- Correction ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.amend_fx_transaction(
  _fx_id uuid,
  _type text,
  _currency text,
  _foreign_amount numeric(20,2),
  _rate numeric(18,6),
  _cost_rate numeric(18,6),
  _settlement text,
  _branch_id uuid,
  _customer_ref text,
  _receipt_no text,
  _notes text,
  _entry_date date,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _original public.fx_transactions%ROWTYPE;
  _date date := coalesce(_entry_date, current_date);
  _reason_text text := trim(coalesce(_reason, ''));
  _lines jsonb;
  _reversal_entry_id uuid;
  _replacement_id uuid;
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

  SELECT * INTO _original FROM public.fx_transactions WHERE id = _fx_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown forex transaction';
  END IF;
  IF NOT private.can_view_branch(_original.branch_id) THEN
    RAISE EXCEPTION 'Forbidden: not assigned to this branch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fx_amendments a WHERE a.fx_id = _fx_id) THEN
    RAISE EXCEPTION 'This trade has already been corrected';
  END IF;
  IF _original.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'This trade has no journal entry to correct';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e WHERE e.reverses_entry_id = _original.journal_entry_id
  ) THEN
    RAISE EXCEPTION 'This trade has already been reversed';
  END IF;

  IF length(_reason_text) < 4 THEN
    RAISE EXCEPTION 'Give a reason of at least 4 characters';
  END IF;
  IF length(_reason_text) > 300 THEN
    RAISE EXCEPTION 'Reason can have at most 300 characters';
  END IF;

  -- Nothing to correct: refuse rather than reverse and re-post an identical
  -- trade, which would only add noise to the ledger.
  IF _type = _original.type
     AND _currency = _original.currency
     AND _foreign_amount = _original.foreign_amount
     AND _rate = _original.rate
     AND _cost_rate = _original.cost_rate
     AND _settlement = _original.settlement
     AND _branch_id = _original.branch_id
     AND trim(coalesce(_customer_ref, '')) = _original.customer_ref
     AND trim(coalesce(_receipt_no, '')) = _original.receipt_no
     AND trim(coalesce(_notes, '')) = _original.notes
     AND _date = _original.entry_date THEN
    RAISE EXCEPTION 'Nothing has changed on this trade';
  END IF;

  -- Mirror the original posting: every debit becomes a credit and vice versa,
  -- for the exact amounts that were posted.
  SELECT jsonb_agg(jsonb_build_object(
           'account_code', a.code,
           'side', CASE WHEN l.side = 'debit' THEN 'credit' ELSE 'debit' END,
           'amount', to_char(l.amount, 'FM999999999999990.00'),
           'memo', left('Correction reversal: ' || coalesce(nullif(l.memo, ''), a.code), 120)))
    INTO _lines
  FROM public.journal_lines l
  JOIN public.accounts a ON a.id = l.account_id
  WHERE l.entry_id = _original.journal_entry_id;

  IF _lines IS NULL THEN
    RAISE EXCEPTION 'The original journal entry has no lines';
  END IF;

  -- Correct today, not in the past: the reversal belongs to the period in which
  -- the mistake was found, which is what auditors expect.
  _reversal_entry_id := private.post_journal_entry_core(
    current_date,
    format('Correction reversal of forex %s %s %s — %s',
      _original.type, to_char(_original.foreign_amount, 'FM999,999,999,990.00'),
      _original.currency, _reason_text),
    'fx_reversal', _original.branch_id, _lines, NULL, _original.journal_entry_id);

  -- Post the corrected trade through the normal path, so the rate is re-read
  -- from the published history and the journal entry is built the same way.
  -- The idempotency key makes a second correction of the same trade impossible
  -- even if the audit row is lost.
  _replacement_id := public.record_fx_transaction(
    _type, _currency, _foreign_amount, _rate, _cost_rate, _settlement, _branch_id,
    _customer_ref, _receipt_no, _notes, _date, 'fx-amend:' || _fx_id::text);

  INSERT INTO public.fx_amendments (fx_id, replacement_id, reason, reversal_entry_id, amended_by)
  VALUES (_fx_id, _replacement_id, _reason_text, _reversal_entry_id, _uid);

  RETURN _replacement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.amend_fx_transaction(uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,text,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_fx_transaction(uuid,text,text,numeric,numeric,numeric,text,uuid,text,text,text,date,text) TO authenticated;

-- RLS ----------------------------------------------------------------------

ALTER TABLE public.fx_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_amendments_read ON public.fx_amendments;
CREATE POLICY fx_amendments_read ON public.fx_amendments FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.fx_transactions f
    WHERE f.id = fx_amendments.fx_id
      AND private.can_view_branch(f.branch_id)
  )
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
);

GRANT SELECT ON public.fx_amendments TO authenticated;
GRANT ALL ON public.fx_amendments TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.fx_amendments FROM authenticated, anon;

DROP TRIGGER IF EXISTS fx_amendments_immutable ON public.fx_amendments;
CREATE TRIGGER fx_amendments_immutable BEFORE UPDATE OR DELETE ON public.fx_amendments
  FOR EACH ROW EXECUTE FUNCTION private.block_ledger_changes();
