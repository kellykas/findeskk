import { useState, type FormEvent } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInSchema } from "@/domain/auth";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === "signed_in") return <Navigate to="/" />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details and try again.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="text-lg font-semibold text-sidebar-primary">FinDesk</div>
        <div>
          <p className="max-w-sm text-2xl font-medium leading-snug text-sidebar-primary">
            Forex Bureau and Mobile Money agency operations, on one ledger.
          </p>
          <p className="mt-3 text-sm">Kampala · Multi-branch</p>
        </div>
        <div className="text-xs opacity-60">© FinDesk</div>
      </div>
      <div className="flex items-center justify-center px-6">
        <form className="w-full max-w-sm space-y-5" onSubmit={handleSubmit}>
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your staff account.</p>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Staff accounts are issued by your company administrator. Roles and branch access are
            granted after your first sign-in.
          </p>
        </form>
      </div>
    </div>
  );
}
