/**
 * Audit trail data access. Rows are written only by database triggers;
 * reading is limited to oversight roles by RLS.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditEvent {
  id: number;
  occurredAt: string;
  actorId: string | null;
  table: string;
  action: string;
  recordId: string | null;
}

export const auditEventsQuery = (limit = 100, table?: string) =>
  queryOptions({
    queryKey: ["audit", limit, table ?? "all"],
    queryFn: async (): Promise<AuditEvent[]> => {
      let q = supabase
        .from("audit_log")
        .select("id, occurred_at, actor_id, table_name, action, record_id")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (table) q = q.eq("table_name", table);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        occurredAt: r.occurred_at,
        actorId: r.actor_id,
        table: r.table_name,
        action: r.action,
        recordId: r.record_id,
      }));
    },
  });
