import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Mail, Phone, RefreshCw, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { ChatThread } from "@/components/service-requests/ChatThread";
import { AccessDenied, PageHeader, SectionCard, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { can } from "@/domain/access";
import {
  REQUEST_STATUS_LABELS,
  isServiceKind,
  serviceLabel,
  validateMessage,
  type RequestStatus,
} from "@/domain/serviceRequests";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";
import {
  replyToServiceRequest,
  setServiceRequestStatus,
  staffRequestQuery,
  staffRequestsQuery,
} from "@/services/service-requests.service";

export const Route = createFileRoute("/requests")({
  head: () => ({
    meta: [
      { title: "Customer requests — FinDesk" },
      {
        name: "description",
        content: "Service requests sent from the public request page, answered in one thread.",
      },
      { property: "og:title", content: "Customer requests — FinDesk" },
    ],
  }),
  component: RequestsPage,
});

/**
 * Updates arrive through the realtime channel the app shell subscribes to, which
 * invalidates every `service-requests` query. These polls only cover a dropped
 * socket.
 */
const LIST_POLL_MS = 30_000;
const THREAD_POLL_MS = 30_000;

const STATUS_TONE: Record<RequestStatus, string> = {
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  answered: "bg-success/12 text-success",
  closed: "bg-muted text-muted-foreground",
};

function RequestsPage() {
  const { viewer } = useSession();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();
  const allowed = Boolean(viewer && can(viewer.roles, "requests.manage"));

  const list = useQuery({
    ...staffRequestsQuery,
    enabled: allowed,
    refetchInterval: allowed ? LIST_POLL_MS : false,
  });

  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => list.data ?? [], [list.data]);

  // Keep a valid selection as the inbox shifts under the poll, and open the
  // oldest waiting conversation first.
  useEffect(() => {
    if (!allowed) return;
    if (rows.length === 0) return;
    if (selectedId === "" || !rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? "");
    }
  }, [allowed, rows, selectedId]);

  useEffect(() => {
    setDraft("");
    setError(null);
  }, [selectedId]);

  const thread = useQuery({
    ...staffRequestQuery(selectedId),
    refetchInterval: THREAD_POLL_MS,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["service-requests"] });
  }

  const reply = useMutation({
    mutationFn: (body: string) => replyToServiceRequest(selectedId, body),
    onSuccess: () => {
      setDraft("");
      setError(null);
      refresh();
    },
    onError: (caught: Error) => setError(caught.message),
  });

  const changeStatus = useMutation({
    mutationFn: (status: RequestStatus) => setServiceRequestStatus(selectedId, status),
    onSuccess: (_data, status) => {
      toast.success(
        status === "closed" ? t("Request closed.") : t("Request reopened for the customer."),
      );
      refresh();
    },
    onError: (caught: Error) => toast.error(caught.message),
  });

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateMessage(draft);
    setError(invalid);
    if (!invalid) reply.mutate(draft.trim());
  }

  if (!allowed) {
    return (
      <AppShell>
        <PageHeader
          title={t("Customer requests")}
          description={t("Service requests from the public request page.")}
        />
        <AccessDenied
          title={t("Customer requests are restricted")}
          description={t(
            "Customer-facing roles answer service requests. Ask a super admin or the company owner to review your roles.",
          )}
        />
      </AppShell>
    );
  }

  const waiting = rows.filter((row) => row.status === "waiting").length;
  const answered = rows.filter((row) => row.status === "answered").length;
  const closed = rows.filter((row) => row.status === "closed").length;
  const selected = thread.data ?? null;
  const stamp = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <AppShell>
      <PageHeader
        title={t("Customer requests")}
        description={t(
          "Requests sent from the public form. Answer here and the customer sees it in their thread.",
        )}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/request" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("Public form")}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${list.isFetching ? "animate-spin" : ""}`}
              />
              {t("Refresh")}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("Waiting for us")} value={String(waiting)} />
        <StatCard label={t("Answered")} value={String(answered)} />
        <StatCard label={t("Closed")} value={String(closed)} />
        <StatCard label={t("Total requests")} value={String(rows.length)} />
      </div>

      {list.isError && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {list.error.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <SectionCard
          title={t("Inbox")}
          action={<span className="text-xs text-muted-foreground">{rows.length}</span>}
        >
          {list.isPending ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t("Loading requests…")}</p>
          ) : rows.length === 0 ? (
            <div className="space-y-2 px-4 py-8 text-center">
              <p className="text-sm font-medium">{t("No requests yet")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Requests sent from the public form appear here.")}
              </p>
            </div>
          ) : (
            <ul className="max-h-[520px] divide-y divide-border/60 overflow-y-auto">
              {rows.map((row) => {
                const active = row.id === selectedId;
                const service = isServiceKind(row.service) ? row.service : "other";
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full cursor-pointer px-4 py-3 text-left transition-colors ${
                        active ? "bg-primary/8" : "hover:bg-muted/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{row.customerName}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[row.status]}`}
                        >
                          {t(REQUEST_STATUS_LABELS[row.status])}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {row.ticketNo} · {t(serviceLabel(service))}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {row.lastAuthorKind === "staff" ? `${t("You")}: ` : ""}
                        {row.lastBody}
                      </p>
                      <div className="mt-1 text-[10px] text-muted-foreground/80">
                        {stamp.format(new Date(row.updatedAt))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={selected ? selected.customerName : t("Conversation")}>
          {!selected ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              {t("Choose a request to read the conversation.")}
            </p>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{selected.ticketNo}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[selected.status]}`}
                    >
                      {t(REQUEST_STATUS_LABELS[selected.status])}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t(serviceLabel(selected.service))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <a
                      href={`tel:${selected.phone}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <Phone className="h-3 w-3" /> {selected.phone}
                    </a>
                    {selected.email && (
                      <a
                        href={`mailto:${selected.email}`}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        <Mail className="h-3 w-3" /> {selected.email}
                      </a>
                    )}
                  </div>
                </div>
                {selected.status === "closed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={changeStatus.isPending}
                    onClick={() => changeStatus.mutate("waiting")}
                  >
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" /> {t("Reopen")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={changeStatus.isPending}
                    onClick={() => changeStatus.mutate("closed")}
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> {t("Close request")}
                  </Button>
                )}
              </div>

              <div className="max-h-[380px] overflow-y-auto px-4 py-4">
                {thread.isPending ? (
                  <p className="text-sm text-muted-foreground">{t("Loading conversation…")}</p>
                ) : thread.isError ? (
                  <p className="text-sm text-destructive">{thread.error.message}</p>
                ) : (
                  <ChatThread messages={selected.messages} own="staff" />
                )}
              </div>

              <div className="border-t border-border/60 px-4 py-3">
                {selected.status === "closed" ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Reopen the request to reply to this customer.")}
                  </p>
                ) : (
                  <form className="space-y-2" onSubmit={send}>
                    {error && (
                      <p role="alert" className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder={t("Write a reply the customer will see in their thread…")}
                      aria-label={t("Reply")}
                      className="w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {selected.messages.length} {t("messages")}
                      </span>
                      <Button type="submit" size="sm" disabled={reply.isPending}>
                        {reply.isPending ? t("Sending…") : t("Send reply")}
                        <Send className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
