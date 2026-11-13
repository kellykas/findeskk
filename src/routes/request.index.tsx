import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, MessageSquare, ShieldCheck, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SERVICE_KINDS, normalizeNewRequest, validateNewRequest } from "@/domain/serviceRequests";
import { useLanguage } from "@/hooks/use-language";
import { createServiceRequest } from "@/services/service-requests.service";

export const Route = createFileRoute("/request/")({
  head: () => ({
    meta: [
      { title: "Request a service — FinDesk" },
      {
        name: "description",
        content: "Send a service request to the branch and follow the answer in one thread.",
      },
    ],
  }),
  component: NewRequestPage,
});

const EMPTY_FORM = {
  customerName: "",
  phone: "",
  email: "",
  service: "forex",
  message: "",
};

function NewRequestPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createServiceRequest(normalizeNewRequest(form)),
    onSuccess: ({ token }) => {
      void navigate({ to: "/request/$token", params: { token } });
    },
    onError: (caught: Error) => setError(caught.message),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateNewRequest(form);
    setError(invalid);
    if (!invalid) create.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          {t("Customer service")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("Request a service")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {t(
            "Tell us what you need and the branch team will answer here. You will get a private link to follow the conversation — no account needed.",
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card className="gap-0 rounded-2xl border-border/70 p-0 shadow-none">
          <form className="space-y-4 p-5 sm:p-6" onSubmit={submit}>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customerName" className="text-xs font-medium">
                  {t("Your name")}
                </Label>
                <Input
                  id="customerName"
                  value={form.customerName}
                  onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                  placeholder={t("e.g. Sarah Nakato")}
                  autoComplete="name"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium">
                  {t("Phone number")}
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+256 7xx xxx xxx"
                  inputMode="tel"
                  autoComplete="tel"
                  className="h-11 rounded-xl"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">
                {t("Email (optional)")}
              </Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="you@example.com"
                autoComplete="email"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="service" className="text-xs font-medium">
                {t("What do you need?")}
              </Label>
              <select
                id="service"
                value={form.service}
                onChange={(event) => setForm({ ...form, service: event.target.value })}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SERVICE_KINDS.map((kind) => (
                  <option key={kind.code} value={kind.code}>
                    {t(kind.label)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-xs font-medium">
                {t("Message")}
              </Label>
              <textarea
                id="message"
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                rows={5}
                maxLength={2000}
                placeholder={t("Tell us what you need, and any amount or reference involved.")}
                className="w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                required
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {form.message.length}/2000
              </p>
            </div>

            <Button
              type="submit"
              disabled={create.isPending}
              className="h-11 w-full rounded-xl text-sm font-semibold"
            >
              {create.isPending ? t("Sending…") : t("Send request")}
              {!create.isPending && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              {t("We use your phone number only to answer this request.")}
            </p>
          </form>
        </Card>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <h2 className="text-sm font-semibold">{t("How it works")}</h2>
            <ul className="mt-3 space-y-3 text-xs text-muted-foreground">
              <li className="flex gap-2.5">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t("Your request reaches the branch team immediately.")}
              </li>
              <li className="flex gap-2.5">
                <Timer className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t("Replies appear in this thread, so you can come back any time.")}
              </li>
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t("Only you and the branch team can read this conversation.")}
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
