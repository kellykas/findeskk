import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { can } from "@/domain/roles";
import { serviceLabel } from "@/domain/serviceRequests";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";
import { staffRequestsQuery } from "@/services/service-requests.service";

const POLL_MS = 20_000;

/**
 * Watches the service request inbox while staff work anywhere in the app, so a
 * waiting customer is not left unseen until someone opens the inbox. The list
 * query is shared with the inbox page, so this poll costs no extra request when
 * that page is already open.
 *
 * `announce` is off for the sidebar badge, which must not raise a toast of its own.
 */
export function useRequestAlerts({ announce = true }: { announce?: boolean } = {}) {
  const { viewer } = useSession();
  const { t, language } = useLanguage();
  const allowed = Boolean(viewer && can(viewer.roles, "requests.manage"));
  const query = useQuery({
    ...staffRequestsQuery,
    enabled: allowed,
    refetchInterval: allowed ? POLL_MS : false,
  });

  // null means "nothing seen yet": the first page arrives on mount and must not
  // be announced as news.
  const seen = useRef<Set<string> | null>(null);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    const rows = query.data;
    if (!rows) return;
    const ids = new Set(rows.map((row) => row.id));
    if (seen.current === null) {
      seen.current = ids;
    } else {
      const fresh = rows.filter((row) => !seen.current?.has(row.id));
      seen.current = ids;
      if (announce && fresh.length > 0) {
        const first = fresh[0];
        toast.info(
          fresh.length === 1
            ? t("New service request from {name}", { name: first?.customerName ?? "" })
            : t("{count} new service requests", { count: fresh.length }),
          {
            description: fresh.length === 1 ? t(serviceLabel(first?.service ?? "")) : undefined,
          },
        );
      }
    }
    setWaiting(rows.filter((row) => row.status === "waiting").length);
  }, [query.data, announce, t, language]);

  return { waiting, allowed };
}
