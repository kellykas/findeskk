-- Public receipt lookup for the QR code printed on every receipt.
--
-- A scanned QR code opens /receipt/<kind>/<id> without a sign-in, so the page
-- needs one receipt by its full record id. The receipt tables stay closed to
-- anonymous readers; this security-definer function is the only public path
-- and returns just the fields the printed receipt shows, never the whole row.
-- Lookup is by the unguessable record id, so it cannot enumerate receipts.

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

-- Company header shown on the public receipt; only the printed fields.
CREATE OR REPLACE FUNCTION public.get_public_receipt_company()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'companyName', s.company_name,
    'address', s.address,
    'phone', s.phone,
    'email', s.email,
    'taxNumber', s.tax_number,
    'receiptFormat', s.receipt_format,
    'receiptFooter', s.receipt_footer
  )
  FROM public.company_settings s
  WHERE s.id
$$;

REVOKE ALL ON FUNCTION public.get_public_receipt(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_receipt_company() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_receipt_company() TO anon, authenticated;
