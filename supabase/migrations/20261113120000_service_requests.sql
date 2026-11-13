-- Customer service requests: a public request form with one chat thread each.
--
-- Rules enforced here, not in the UI:
--   * Both tables are closed to anon and authenticated. A visitor holding the
--     unguessable token can read and add messages to that one request through
--     security-definer functions; staff list and answer through functions that
--     check their role. Nobody can page through other customers' phone numbers.
--   * A request waits, becomes answered when staff reply, and returns to
--     waiting when the customer writes again.
--   * Submissions are capped per phone number, so the public form cannot be used
--     to flood the inbox.

CREATE SEQUENCE IF NOT EXISTS public.service_request_seq;

CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE DEFAULT (
    'REQ-' || lpad(nextval('public.service_request_seq')::text, 5, '0')
  ),
  token text NOT NULL UNIQUE DEFAULT replace(
    gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
  ),
  customer_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL DEFAULT '',
  service text NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_name_valid CHECK (length(btrim(customer_name)) BETWEEN 2 AND 80),
  CONSTRAINT service_requests_phone_valid CHECK (phone ~ '^[0-9+ ()-]{7,20}$'),
  CONSTRAINT service_requests_email_valid CHECK (
    email = ''
    OR (length(email) <= 120 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  CONSTRAINT service_requests_service_valid CHECK (
    service IN ('forex', 'mobile_money', 'cash_transfer', 'account', 'other')
  ),
  CONSTRAINT service_requests_status_valid CHECK (status IN ('waiting', 'answered', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.service_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  author_kind text NOT NULL,
  author_id uuid REFERENCES public.profiles(id),
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_request_messages_kind_valid CHECK (author_kind IN ('customer', 'staff')),
  CONSTRAINT service_request_messages_body_valid CHECK (length(btrim(body)) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS service_requests_status_idx
  ON public.service_requests (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_phone_idx
  ON public.service_requests (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS service_request_messages_request_idx
  ON public.service_request_messages (request_id, created_at);

-- Deny by default: readers and writers go through the functions below.
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_requests FROM anon, authenticated;
REVOKE ALL ON public.service_request_messages FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.service_request_seq FROM anon, authenticated;

-- Who may answer customers. Tellers included: they are the people a walk-in
-- customer actually reaches.
CREATE OR REPLACE FUNCTION private.can_serve_requests()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_role(auth.uid(), 'super_admin')
      OR private.has_role(auth.uid(), 'company_owner')
      OR private.has_role(auth.uid(), 'general_manager')
      OR private.has_role(auth.uid(), 'branch_manager')
      OR private.has_role(auth.uid(), 'supervisor')
      OR private.has_role(auth.uid(), 'forex_teller')
      OR private.has_role(auth.uid(), 'mobile_money_teller')
$$;

REVOKE ALL ON FUNCTION private.can_serve_requests() FROM PUBLIC;

-- Public: create a request and its opening message -------------------------

CREATE OR REPLACE FUNCTION public.create_service_request(
  _name text,
  _phone text,
  _email text,
  _service text,
  _message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_name text := btrim(COALESCE(_name, ''));
  _clean_phone text := btrim(COALESCE(_phone, ''));
  _clean_email text := lower(btrim(COALESCE(_email, '')));
  _clean_service text := btrim(COALESCE(_service, ''));
  _clean_message text := btrim(COALESCE(_message, ''));
  _row public.service_requests;
BEGIN
  IF length(_clean_name) < 2 OR length(_clean_name) > 80 THEN
    RAISE EXCEPTION 'Enter the name we should call you by.';
  END IF;
  IF _clean_phone !~ '^[0-9+ ()-]{7,20}$' THEN
    RAISE EXCEPTION 'Enter a phone number we can reach you on.';
  END IF;
  IF _clean_email <> '' AND (
    length(_clean_email) > 120
    OR _clean_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'That email address does not look right.';
  END IF;
  IF _clean_service NOT IN ('forex', 'mobile_money', 'cash_transfer', 'account', 'other') THEN
    RAISE EXCEPTION 'Choose the service you need.';
  END IF;
  IF length(_clean_message) < 5 OR length(_clean_message) > 2000 THEN
    RAISE EXCEPTION 'Tell us what you need in a few words.';
  END IF;

  -- Five requests an hour from one number is generous for a real customer and
  -- useless for a script.
  IF (
    SELECT count(*) FROM public.service_requests r
    WHERE r.phone = _clean_phone AND r.created_at > now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'Too many requests from this number. Please wait an hour or call the branch.';
  END IF;

  INSERT INTO public.service_requests (customer_name, phone, email, service)
  VALUES (_clean_name, _clean_phone, _clean_email, _clean_service)
  RETURNING * INTO _row;

  INSERT INTO public.service_request_messages (request_id, author_kind, author_name, body)
  VALUES (_row.id, 'customer', _clean_name, _clean_message);

  RETURN jsonb_build_object(
    'token', _row.token,
    'ticketNo', _row.ticket_no,
    'createdAt', _row.created_at
  );
END;
$$;

-- Public: read one thread by its token --------------------------------------

CREATE OR REPLACE FUNCTION public.get_service_request(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ticketNo', r.ticket_no,
    'customerName', r.customer_name,
    'service', r.service,
    'status', r.status,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at,
    'messages', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'authorKind', m.author_kind,
          'authorName', m.author_name,
          'body', m.body,
          'createdAt', m.created_at
        )
        ORDER BY m.created_at
      )
      FROM public.service_request_messages m
      WHERE m.request_id = r.id
    ), '[]'::jsonb)
  )
  FROM public.service_requests r
  WHERE r.token = btrim(COALESCE(_token, ''))
$$;

-- Public: the customer writes again -----------------------------------------

CREATE OR REPLACE FUNCTION public.add_service_request_message(_token text, _message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.service_requests;
  _body text := btrim(COALESCE(_message, ''));
BEGIN
  IF length(_body) < 1 OR length(_body) > 2000 THEN
    RAISE EXCEPTION 'Keep your message under 2000 characters.';
  END IF;

  SELECT * INTO _row
  FROM public.service_requests r
  WHERE r.token = btrim(COALESCE(_token, ''))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This request link is not valid.';
  END IF;
  IF _row.status = 'closed' THEN
    RAISE EXCEPTION 'This request was closed. Start a new request.';
  END IF;

  INSERT INTO public.service_request_messages (request_id, author_kind, author_name, body)
  VALUES (_row.id, 'customer', _row.customer_name, _body);

  UPDATE public.service_requests
  SET status = 'waiting', updated_at = now()
  WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Staff: the inbox ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_service_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_serve_requests() THEN
    RAISE EXCEPTION 'Only staff can read service requests.';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'ticketNo', r.ticket_no,
        'customerName', r.customer_name,
        'phone', r.phone,
        'email', r.email,
        'service', r.service,
        'status', r.status,
        'createdAt', r.created_at,
        'updatedAt', r.updated_at,
        'lastBody', COALESCE(last.body, ''),
        'lastAuthorKind', COALESCE(last.author_kind, 'customer'),
        'messageCount', COALESCE(cnt.total, 0)
      )
      ORDER BY
        CASE r.status WHEN 'waiting' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,
        r.updated_at DESC
    )
    FROM public.service_requests r
    LEFT JOIN LATERAL (
      SELECT m.body, m.author_kind
      FROM public.service_request_messages m
      WHERE m.request_id = r.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ) last ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total
      FROM public.service_request_messages m
      WHERE m.request_id = r.id
    ) cnt ON true
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_service_request(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_serve_requests() THEN
    RAISE EXCEPTION 'Only staff can read service requests.';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', r.id,
      'ticketNo', r.ticket_no,
      'customerName', r.customer_name,
      'phone', r.phone,
      'email', r.email,
      'service', r.service,
      'status', r.status,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at,
      'messages', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'authorKind', m.author_kind,
            'authorName', m.author_name,
            'body', m.body,
            'createdAt', m.created_at
          )
          ORDER BY m.created_at
        )
        FROM public.service_request_messages m
        WHERE m.request_id = r.id
      ), '[]'::jsonb)
    )
    FROM public.service_requests r
    WHERE r.id = _id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_reply_service_request(_id uuid, _message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _status text;
  _body text := btrim(COALESCE(_message, ''));
BEGIN
  IF _uid IS NULL OR NOT private.can_serve_requests() THEN
    RAISE EXCEPTION 'Only staff can reply to service requests.';
  END IF;
  IF length(_body) < 1 OR length(_body) > 2000 THEN
    RAISE EXCEPTION 'Keep replies under 2000 characters.';
  END IF;

  SELECT r.status INTO _status FROM public.service_requests r WHERE r.id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.';
  END IF;
  IF _status = 'closed' THEN
    RAISE EXCEPTION 'Reopen the request before replying.';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.email, 'Staff')
  INTO _name
  FROM public.profiles p
  WHERE p.id = _uid;

  INSERT INTO public.service_request_messages (request_id, author_kind, author_id, author_name, body)
  VALUES (_id, 'staff', _uid, COALESCE(_name, 'Staff'), _body);

  UPDATE public.service_requests
  SET status = 'answered', updated_at = now()
  WHERE id = _id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_service_request_status(_id uuid, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean text := btrim(COALESCE(_status, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT private.can_serve_requests() THEN
    RAISE EXCEPTION 'Only staff can change a service request.';
  END IF;
  IF _clean NOT IN ('waiting', 'answered', 'closed') THEN
    RAISE EXCEPTION 'Unknown request status.';
  END IF;

  UPDATE public.service_requests
  SET status = _clean, updated_at = now()
  WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request no longer exists.';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Execute rights ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_service_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_service_request(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_service_request_message(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_service_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_service_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_reply_service_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_service_request_status(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_service_request(text, text, text, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_request(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_service_request_message(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_service_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_service_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reply_service_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_service_request_status(uuid, text) TO authenticated;
