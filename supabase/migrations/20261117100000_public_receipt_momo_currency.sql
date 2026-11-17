-- Public mobile money receipts keep the currency the customer paid in.
--
-- Why: a USD deposit used to print as shillings on the QR page, because the
-- lookup returned only the UGX ledger amount. The transaction already stores
-- its currency, foreign amount and rate, so the public receipt returns them
-- too and the printed sheet shows what the customer actually handed over.
-- Additive only: the UGX fields are unchanged, so older clients keep working.

CREATE OR REPLACE FUNCTION public.get_public_receipt(_kind text, _id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind = 'fx' THEN (
      SELECT jsonb_build_object(
        'kind', 'fx',
        'id', f.id,
        'type', f.type,
        'currency', f.currency,
        'foreignAmount', f.foreign_amount,
        'rate', f.rate,
        'ugxAmount', f.ugx_amount,
        'costAmount', f.cost_amount,
        'margin', f.margin,
        'settlement', f.settlement,
        'receiptNo', f.receipt_no,
        'customerRef', f.customer_ref,
        'notes', f.notes,
        'entryDate', f.entry_date,
        'branchName', b.name,
        'servedBy', COALESCE(p.display_name, '')
      )
      FROM public.fx_transactions f
      JOIN public.branches b ON b.id = f.branch_id
      LEFT JOIN public.profiles p ON p.id = f.created_by
      WHERE f.id = _id
    )
    WHEN _kind = 'momo' THEN (
      SELECT jsonb_build_object(
        'kind', 'momo',
        'id', m.id,
        'network', m.network,
        'networkName', COALESCE(n.name, m.network),
        'type', m.type,
        'amount', m.amount,
        'commission', m.commission,
        'currency', m.currency,
        'foreignAmount', m.foreign_amount,
        'rate', m.rate,
        'customer', COALESCE(c.name, NULLIF(m.customer_ref, ''), 'Walk-in'),
        'networkRef', m.network_ref,
        'notes', m.notes,
        'entryDate', m.entry_date,
        'branchName', b.name,
        'servedBy', COALESCE(p.display_name, '')
      )
      FROM public.momo_transactions m
      JOIN public.branches b ON b.id = m.branch_id
      LEFT JOIN public.momo_networks n ON n.code = m.network
      LEFT JOIN public.customers c ON c.id = m.customer_id
      LEFT JOIN public.profiles p ON p.id = m.created_by
      WHERE m.id = _id
    )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.get_public_receipt(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(text, uuid) TO anon, authenticated;
