import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";

import { BrandMark } from "@/components/auth/BrandMark";
import { LoginShowcase } from "@/components/auth/LoginShowcase";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInSchema } from "@/domain/auth";
import { useLanguage } from "@/hooks/use-language";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FinDesk" },
      {
        name: "description",
        content: "Sign in to FinDesk to manage forex and mobile money operations.",
      },
      { property: "og:title", content: "Sign in — FinDesk" },
      {
        property: "og:description",
        content: "Sign in to FinDesk to manage forex and mobile money operations.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { status, signIn } = useSession();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "signed_in") return <Navigate to="/" />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      // Zod messages come from the schema, which is English; the fallback keeps
      // the screen usable when it has no message of its own.
      setError(parsed.error.issues[0]?.message ?? t("Check your details and try again."));
      return;
    }

    setError(null);
    setPending(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Sign-in failed. Try again."));
    } finally {
      setPending(false);
    }
  }

  // m-auto rather than items-center: when the card is taller than a short
  // landscape screen it stays top-aligned and scrollable instead of being
  // clipped above the viewport.
  return (
    <div className="flex min-h-dvh justify-center bg-background p-4 sm:p-6 lg:p-8">
      <div className="m-auto grid w-full max-w-[1180px] overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-[0_40px_90px_-60px_oklch(0.42_0.14_300/0.7)] lg:grid-cols-2">
        <div className="flex flex-col p-6 sm:p-10 lg:min-h-[560px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-lg font-semibold tracking-tight">FinDesk</span>
            </div>
            <LanguageToggle />
          </div>

          <div className="flex flex-1 flex-col justify-center py-10">
            <div className="mx-auto w-full max-w-[360px]">
              <h1 className="text-center text-2xl font-semibold tracking-tight sm:text-[26px]">
                {t("Sign in to FinDesk")}
              </h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {t("Use your staff account.")}
              </p>

              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium">
                    {t("Email")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.co.ug"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="h-12 rounded-xl border-border/80 bg-background/60 px-3.5 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium">
                    {t("Password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={reveal ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="h-12 rounded-xl border-border/80 bg-background/60 pl-3.5 pr-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((current) => !current)}
                      aria-label={t(reveal ? "Hide password" : "Show password")}
                      aria-pressed={reveal}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={pending}
                  className="mt-2 h-12 w-full rounded-xl text-sm font-semibold shadow-sm"
                >
                  {pending ? t("Signing in…") : t("Sign in")}
                </Button>
              </form>

              <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "Staff accounts are issued by your company administrator. Roles and branch access are granted after your first sign-in.",
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>© FinDesk</span>
            <span>{t("Kampala · Uganda")}</span>
          </div>
        </div>

        <LoginShowcase />
      </div>
    </div>
  );
}
