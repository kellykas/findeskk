-- Resetting a company to a clean book.
--
-- Rules enforced here, not in the UI:
--   * Only a super admin may wipe operational history. The company owner can
--     change settings but cannot destroy the books.
--   * Posted rows are immutable on purpose (private.block_ledger_changes).
--     A reset is the one legitimate exception, so the function lifts those
--     triggers inside its own transaction and restores them before it returns.
--   * The whole wipe is one transaction: a failure leaves the books untouched,
--     never half-erased.
--   * Employees survive, with the setup the app needs to keep working: staff
--     profiles, their roles and branch assignments, branches, the company profile
--     and branding, the chart of accounts, mobile money networks and currencies.
--     Everything staff recorded — activity, customers and the rate history — is
--     removed, so the bureau re-enters the day's rates on a clean book.

CREATE OR REPLACE FUNCTION private.can_reset_company_data()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(auth.uid(), 'super_admin')
$$;

REVOKE ALL ON FUNCTION private.can_reset_company_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_reset_company_data() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_company_data(_confirmation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
  r record;
BEGIN
  IF NOT private.can_reset_company_data() THEN
    RAISE EXCEPTION 'Only a super admin can delete company data' USING ERRCODE = '42501';
  END IF;

  IF upper(btrim(coalesce(_confirmation, ''))) <> 'RESET' THEN
    RAISE EXCEPTION 'Type RESET to confirm deleting company data' USING ERRCODE = '22023';
  END IF;

  -- Lift the immutability triggers for this transaction only. They are restored
  -- before returning, and any failure rolls the whole transaction back, so the
  -- books are never left writable.
  FOR r IN
    SELECT * FROM unnest(
      ARRAY['momo_reversals', 'journal_lines', 'journal_entries', 'momo_transactions',
            'fx_transactions', 'expenses', 'incomes', 'currency_transfers'],
      ARRAY['momo_reversals_immutable', 'journal_lines_immutable', 'journal_entries_immutable',
            'momo_transactions_immutable', 'fx_transactions_immutable', 'expenses_immutable',
            'incomes_immutable', 'currency_transfers_immutable']
    ) AS t(tbl, trg)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.tbl, r.trg);
    EXCEPTION WHEN undefined_table OR undefined_object THEN
      NULL;
    END;
  END LOOP;

  -- Children first: reversals and journal lines, then the transaction records
  -- that point at journal entries, then the entries themselves.
  DELETE FROM public.momo_reversals;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('momo_reversals', v_n);

  DELETE FROM public.journal_lines;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('journal_lines', v_n);

  DELETE FROM public.momo_transactions;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('momo_transactions', v_n);

  DELETE FROM public.fx_transactions;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fx_transactions', v_n);

  DELETE FROM public.expenses;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('expenses', v_n);

  DELETE FROM public.incomes;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('incomes', v_n);

  DELETE FROM public.currency_transfers;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('currency_transfers', v_n);

  DELETE FROM public.journal_entries;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('journal_entries', v_n);

  DELETE FROM public.customers;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('customers', v_n);

  -- Rates are entered by staff each day, so they are history, not setup.
  DELETE FROM public.fx_rates;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('fx_rates', v_n);

  FOR r IN
    SELECT * FROM unnest(
      ARRAY['momo_reversals', 'journal_lines', 'journal_entries', 'momo_transactions',
            'fx_transactions', 'expenses', 'incomes', 'currency_transfers'],
      ARRAY['momo_reversals_immutable', 'journal_lines_immutable', 'journal_entries_immutable',
            'momo_transactions_immutable', 'fx_transactions_immutable', 'expenses_immutable',
            'incomes_immutable', 'currency_transfers_immutable']
    ) AS t(tbl, trg)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', r.tbl, r.trg);
    EXCEPTION WHEN undefined_table OR undefined_object THEN
      NULL;
    END;
  END LOOP;

  -- References and customer codes start from 1 again, so a fresh book reads
  -- like a new install rather than a continuation of deleted history.
  IF to_regclass('public.journal_entry_ref_seq') IS NOT NULL THEN
    PERFORM setval('public.journal_entry_ref_seq', 1, false);
  END IF;
  IF to_regclass('public.customer_code_seq') IS NOT NULL THEN
    PERFORM setval('public.customer_code_seq', 1, false);
  END IF;

  -- The per-row audit entries written by the deletes above go too: a clean book
  -- includes a clean trail. One record of the reset itself survives.
  DELETE FROM public.audit_log;
  INSERT INTO public.audit_log(actor_id, table_name, action, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    'platform',
    'RESET',
    NULL,
    NULL,
    jsonb_build_object('deleted', v_counts, 'at', now())
  );

  RETURN jsonb_build_object('deleted', v_counts);
END $$;

REVOKE ALL ON FUNCTION public.reset_company_data(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_company_data(text) TO authenticated;
