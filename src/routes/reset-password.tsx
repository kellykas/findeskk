import { useEffect, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";

import { BrandMark } from "@/components/auth/BrandMark";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema } from "@/domain/auth";
import { useLanguage } from "@/hooks/use-language";
import { getSession, setNewPassword } from "@/services/auth.service";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — FinDesk" },
      {
        name: "description",
        content: "Choose a new password for your FinDesk staff account.",
      },
    ],
  }),
  component: ResetPassword,
});

/**
 * The recovery link signs the user in with a short-lived session, so this page
 * only works while that session exists. An opened-twice or expired link is
 * turned into a clear "request a new one" instead of a dead form.
 */
type Stage = "checking" | "ready" | "expired" | "done";

function ResetPassword() {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    const check = async () => {
      const session = await getSession().catch(() => null);
      if (!live) return;
      if (session) setStage((current) => (current === "done" ? current : "ready"));
      else setStage((current) => (current === "checking" ? "expired" : current));
    };
    void check();
    // The client reads the recovery tokens out of the URL while it initialises,
    // so give it one short retry before declaring the link dead.
    const retry = setTimeout(check, 1500);
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Check your details and try again."));
      return;
    }

    setError(null);
    setPending(true);
    try {
      await setNewPassword(parsed.data.password);
      setStage("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("Could not save the new password."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh justify-center bg-background p-4 sm:p-6">
      <div className="m-auto w-full max-w-[430px] rounded-[28px] border border-border/70 bg-card p-6 shadow-[0_40px_90px_-60px_oklch(0.42_0.14_300/0.7)] sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">FinDesk</span>
          </div>
          <LanguageToggle />
        </div>

        <div className="mt-8">
          <h1 className="text-center text-2xl font-semibold tracking-tight">
            {t("Set a new password")}
          </h1>

          {stage === "checking" && (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              {t("Checking your link…")}
            </p>
          )}

          {stage === "expired" && (
            <div className="mt-6 space-y-4 text-center">
              <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t("That reset link has expired.")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("Request a new one from the sign-in screen.")}
              </p>
              <Button asChild className="h-11 w-full rounded-xl text-sm font-semibold">
                <Link to="/login">{t("Request a new link")}</Link>
              </Button>
            </div>
          )}

          {stage === "ready" && (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs font-medium">
                  {t("New password")}
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={reveal ? "text" : "password"}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
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

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs font-medium">
                  {t("Confirm new password")}
                </Label>
                <Input
                  id="confirm-password"
                  type={reveal ? "text" : "password"}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  className="h-12 rounded-xl border-border/80 bg-background/60 px-3.5 text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={pending}
                className="mt-2 h-12 w-full rounded-xl text-sm font-semibold shadow-sm"
              >
                {pending ? t("Saving…") : t("Save password")}
              </Button>

              <Link
                to="/login"
                className="block text-center text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("Back to sign in")}
              </Link>
            </form>
          )}

          {stage === "done" && (
            <div className="mt-6 space-y-4 text-center">
              <p className="rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm">
                {t("Your password has been changed.")}
              </p>
              <Button asChild className="h-11 w-full rounded-xl text-sm font-semibold">
                <Link to="/">{t("Go to the dashboard")}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
