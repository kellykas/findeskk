-- Split journal posting mechanics from authorization.
--
-- private.post_journal_entry() refuses anyone without a general ledger-posting
-- role (super admin, owner, accountant). Operational recording functions —
-- mobile money and forex — must post entries for tellers whose roles cannot
-- post arbitrary ledger entries. So:
--
--   * private.post_journal_entry_core() holds the mechanics (validation,
--     reference generation, idempotency, line inserts, balance checks) and
--     assumes the caller has already authorized the transaction.
--   * private.post_journal_entry() keeps its public contract: same signature,
--     same checks, now delegating to core. The wrapper is what the ledger
--     screen's RPC reaches, so tellers still cannot post arbitrary entries.
--   * Operational RPCs check their own permission (can_transact_momo /
--     can_transact_forex, branch scope) and then call core directly.

CREATE OR REPLACE FUNCTION private.post_journal_entry_core(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _entry_id uuid;
  _existing uuid;
  _reference text;
  _line jsonb;
  _account public.accounts;
  _debit numeric(20,2) := 0;
  _credit numeric(20,2) := 0;
  _amount numeric(20,2);
  _line_no int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  IF _entry_date IS NULL THEN
    RAISE EXCEPTION 'Entry date is required';
  END IF;
  IF _entry_date > current_date THEN
    RAISE EXCEPTION 'Entry date cannot be in the future';
  END IF;
  IF length(trim(coalesce(_description,''))) < 4 THEN
    RAISE EXCEPTION 'A description of at least 4 characters is required';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines';
  END IF;

  IF _branch_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = _branch_id AND b.active) THEN
      RAISE EXCEPTION 'Invalid or inactive branch';
    END IF;
    IF NOT (private.can_view_all_branches()
            OR EXISTS (SELECT 1 FROM public.branch_assignments a WHERE a.branch_id = _branch_id AND a.user_id = _uid)) THEN
      RAISE EXCEPTION 'Not assigned to this branch';
    END IF;
  END IF;

  IF _reverses_entry_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id = _reverses_entry_id) THEN
      RAISE EXCEPTION 'The entry being reversed does not exist';
    END IF;
    IF NOT private.can_view_branch((SELECT e.branch_id FROM public.journal_entries e WHERE e.id = _reverses_entry_id)) THEN
      RAISE EXCEPTION 'Forbidden: cannot reverse an entry from an unassigned branch';
    END IF;
  END IF;

  _reference := 'JV-' || to_char(_entry_date,'YYYY') || '-'
    || lpad(nextval('public.journal_entry_ref_seq')::text, 6, '0');

  INSERT INTO public.journal_entries
    (reference, entry_date, description, entry_type, branch_id, idempotency_key, reverses_entry_id, created_by)
  VALUES
    (_reference, _entry_date, trim(_description), coalesce(nullif(trim(_entry_type),''),'manual'),
     _branch_id, _idempotency_key, _reverses_entry_id, _uid)
  RETURNING id INTO _entry_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _line_no := _line_no + 1;

    IF coalesce(_line->>'side','') NOT IN ('debit','credit') THEN
      RAISE EXCEPTION 'Line % has an invalid side', _line_no;
    END IF;

    _amount := (_line->>'amount')::numeric(20,2);
    IF _amount IS NULL OR _amount <= 0 THEN
      RAISE EXCEPTION 'Line % amount must be greater than zero', _line_no;
    END IF;

    SELECT * INTO _account FROM public.accounts a
     WHERE a.active
       AND (a.code = _line->>'account_code' OR a.id::text = _line->>'account_id');
    IF _account.id IS NULL THEN
      RAISE EXCEPTION 'Line % references an unknown or inactive account', _line_no;
    END IF;

    INSERT INTO public.journal_lines (entry_id, account_id, branch_id, side, amount, memo)
    VALUES (_entry_id, _account.id, coalesce((_line->>'branch_id')::uuid, _branch_id),
            _line->>'side', _amount, coalesce(_line->>'memo',''));

    IF _line->>'side' = 'debit' THEN
      _debit := _debit + _amount;
    ELSE
      _credit := _credit + _amount;
    END IF;
  END LOOP;

  IF _debit <> _credit THEN
    RAISE EXCEPTION 'Journal entry is not balanced: debits % <> credits %', _debit, _credit;
  END IF;

  RETURN _entry_id;
EXCEPTION
  WHEN unique_violation THEN
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _existing FROM public.journal_entries WHERE idempotency_key = _idempotency_key;
      IF _existing IS NOT NULL THEN
        RETURN _existing;
      END IF;
    END IF;
    RAISE;
END;
$$;

-- The mechanics are internal: only definer functions call core directly.
REVOKE ALL ON FUNCTION private.post_journal_entry_core(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The existing posting function keeps its contract and authorization, and now
-- delegates the mechanics to core.
CREATE OR REPLACE FUNCTION private.post_journal_entry(
  _entry_date date,
  _description text,
  _entry_type text,
  _branch_id uuid,
  _lines jsonb,
  _idempotency_key text DEFAULT NULL,
  _reverses_entry_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _uid AND p.active) THEN
    RAISE EXCEPTION 'Staff profile not found or inactive';
  END IF;
  IF NOT private.can_post_journal() THEN
    RAISE EXCEPTION 'Forbidden: your roles cannot post journal entries';
  END IF;

  RETURN private.post_journal_entry_core(
    _entry_date, _description, _entry_type, _branch_id, _lines,
    _idempotency_key, _reverses_entry_id);
END;
$$;

REVOKE ALL ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.post_journal_entry(date,text,text,uuid,jsonb,text,uuid) TO authenticated;
