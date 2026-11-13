import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { ChatThread } from "@/components/service-requests/ChatThread";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  REQUEST_STATUS_LABELS,
  isServiceKind,
  serviceLabel,
  validateMessage,
  type RequestStatus,
} from "@/domain/serviceRequests";
import { useLanguage } from "@/hooks/use-language";
import { publicRequestQuery, sendCustomerMessage } from "@/services/service-requests.service";

export const Route = createFileRoute("/request/$token")({
  head: () => ({
    meta: [
      { title: "Your request — FinDesk" },
      { name: "description", content: "Follow your service request and reply to the branch team." },
    ],
  }),
  component: RequestThreadPage,
});

const STATUS_TONE: Record<RequestStatus, string> = {
  waiting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  answered: "bg-success/12 text-success",
  closed: "bg-muted text-muted-foreground",
};

const POLL_MS = 5_000;

function RequestThreadPage() {
  const { token } = Route.useParams();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const thread = useQuery({
    ...publicRequestQuery(token),
    refetchInterval: POLL_MS,
  });

  const send = useMutation({
    mutationFn: (body: string) => sendCustomerMessage(token, body),
    onSuccess: () => {
      setDraft("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["service-requests", "public", token] });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateMessage(draft);
    setError(invalid);
    if (!invalid) send.mutate(draft.trim());
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast.success(t("Link copied. Keep it to return to this conversation."));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("Could not copy the link. Copy it from the address bar instead."));
    }
  }

  if (thread.isPending) {
    return (
      <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground shadow-none">
        {t("Opening your request…")}
      </Card>
    );
  }

  if (thread.isError) {
    return (
      <Card className="gap-2 rounded-2xl p-8 text-center shadow-none">
        <p className="text-sm font-medium">{t("We could not open this request")}</p>
        <p className="text-sm text-muted-foreground">{thread.error.message}</p>
        <Button variant="outline" size="sm" onClick={() => void thread.refetch()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {t("Try again")}
        </Button>
      </Card>
    );
  }

  if (!thread.data) {
    return (
      <Card className="gap-2 rounded-2xl p-8 text-center shadow-none">
        <p className="text-sm font-medium">{t("That link does not match a request")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Check the link, or start a new request and we will answer it here.")}
        </p>
        <Link
          to="/request"
          className="mx-auto mt-1 text-sm font-semibold text-primary hover:underline"
        >
          {t("Start a new request")}
        </Link>
      </Card>
    );
  }

  const request = thread.data;
  const closed = request.status === "closed";
  const service = isServiceKind(request.service) ? request.service : "other";

  return (
    <div className="space-y-4">
      <Card className="gap-0 rounded-2xl border-border/70 p-0 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {request.ticketNo}
            </p>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
              {t(serviceLabel(service))}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                new Date(request.createdAt),
              )}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TONE[request.status]}`}
          >
            {t(REQUEST_STATUS_LABELS[request.status])}
          </span>
        </div>

        <div className="p-5">
          <ChatThread messages={request.messages} own="customer" />
        </div>

        <div className="border-t border-border/60 p-4 sm:p-5">
          {closed ? (
            <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{t("This request is closed.")}</span>
              <Link to="/request" className="font-semibold text-primary hover:underline">
                {t("Start a new request")}
              </Link>
            </div>
          ) : (
            <form className="space-y-2" onSubmit={submit}>
              {error && (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              )}
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={t("Write a message…")}
                aria-label={t("Message")}
                className="w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyLink()}
                  className="text-xs text-muted-foreground"
                >
                  {copied ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? t("Copied") : t("Save this link")}
                </Button>
                <Button type="submit" size="sm" disabled={send.isPending}>
                  {send.isPending ? t("Sending…") : t("Send")}
                  <Send className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      <p className="text-center text-[11px] text-muted-foreground">
        {t(
          "Bookmark this page. It is the only way back to this conversation, and it is private to you.",
        )}
      </p>
    </div>
  );
}
