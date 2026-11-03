CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  table_name text NOT NULL,
  action text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_view_audit()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'company_owner')
      OR public.has_role(auth.uid(),'general_manager') OR public.has_role(auth.uid(),'accountant')
      OR public.has_role(auth.uid(),'auditor')
$$;
REVOKE ALL ON FUNCTION private.can_view_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_view_audit() TO authenticated;

CREATE POLICY "Oversight roles read audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (private.can_view_audit());

CREATE OR REPLACE FUNCTION private.write_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.audit_log(actor_id, table_name, action, record_id, old_data, new_data)
  VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, r->>'id',
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','user_roles','branches','branch_assignments','accounts','journal_entries','customers','momo_transactions','fx_rates','fx_transactions','company_settings','expenses'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION private.write_audit()', t);
    END IF;
  END LOOP;
END $$;