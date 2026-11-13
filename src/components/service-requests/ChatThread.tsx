/**
 * The conversation bubbles shared by the customer's request page and the staff
 * inbox. Presentation only — no fetching and no business rules.
 */
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ChatMessage } from "@/services/service-requests.service";

function stamp(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ChatThread({
  messages,
  own,
  emptyLabel,
}: {
  messages: ChatMessage[];
  /** Which side of the conversation the reader is on; their own bubbles sit right. */
  own: "customer" | "staff";
  emptyLabel?: string;
}) {
  const { locale, t } = useLanguage();

  if (messages.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">
        {emptyLabel ?? t("No messages yet.")}
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {messages.map((message) => {
        const mine = message.authorKind === own;
        const who =
          message.authorKind === "staff"
            ? message.authorName || t("Branch team")
            : message.authorName || t("Customer");
        return (
          <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                mine
                  ? "rounded-br-sm bg-primary text-primary-foreground"
                  : "rounded-bl-sm bg-muted text-foreground",
              )}
            >
              <div
                className={cn(
                  "mb-1 flex flex-wrap items-center gap-x-2 text-[11px]",
                  mine ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                <span className="font-medium">{mine ? t("You") : who}</span>
                <time dateTime={message.createdAt}>{stamp(message.createdAt, locale)}</time>
              </div>
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
