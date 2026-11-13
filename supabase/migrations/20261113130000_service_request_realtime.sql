-- Instant delivery for service requests.
--
-- Every new message and every status change pings two broadcast topics: the
-- staff inbox and the customer's own thread. The ping carries a request id and
-- a status only — never a message body, name or phone number — because these
-- are public channels; clients treat it purely as a cue to refetch through the
-- authorised functions.
--
-- Broadcast rather than postgres_changes: the tables have no SELECT policy for
-- anonymous visitors, and a customer holds nothing but a token, so row-level
-- change streams could never reach them. realtime.send() runs as the table
-- owner and can publish without opening the tables.

CREATE OR REPLACE FUNCTION private.service_request_ping(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _token text;
  _status text;
  _payload jsonb;
BEGIN
  SELECT r.token, r.status INTO _token, _status
  FROM public.service_requests r
  WHERE r.id = _request_id;

  IF _token IS NULL THEN
    RETURN;
  END IF;

  _payload := jsonb_build_object('requestId', _request_id, 'status', _status);

  PERFORM realtime.send(_payload, 'changed', 'service-requests:staff', false);
  PERFORM realtime.send(_payload, 'changed', 'service-request:' || _token, false);
END;
$$;

REVOKE ALL ON FUNCTION private.service_request_ping(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.on_service_request_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.service_request_ping(NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_request_messages_ping ON public.service_request_messages;
CREATE TRIGGER service_request_messages_ping
  AFTER INSERT ON public.service_request_messages
  FOR EACH ROW
  EXECUTE FUNCTION private.on_service_request_message();

CREATE OR REPLACE FUNCTION private.on_service_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.service_request_ping(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_requests_ping ON public.service_requests;
CREATE TRIGGER service_requests_ping
  AFTER UPDATE ON public.service_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.on_service_request_change();
