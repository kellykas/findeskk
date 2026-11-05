-- Allow several phone numbers in the company profile.
--
-- The profile phone is printed on receipts and other documents, and a bureau
-- usually publishes more than one line ("+256 757 094429 / +256 751 090").
-- Only the length ceiling grows, from 30 to 60 characters; every other rule in
-- the constraint stays as it was, so no existing row can become invalid.

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_text_lengths;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_text_lengths CHECK (
    length(company_name) BETWEEN 1 AND 80
    AND length(legal_name) <= 120
    AND length(address) <= 200
    AND length(phone) <= 60
    AND length(email) <= 120
    AND length(tax_number) <= 40
    AND length(receipt_footer) <= 200
    AND cardinality(currency_codes) BETWEEN 1 AND 12
  );
