import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — FinDesk" },
      { name: "description", content: "Sign in to FinDesk to manage forex and mobile money operations." },
      { property: "og:title", content: "Sign in — FinDesk" },
      { property: "og:description", content: "Sign in to FinDesk to manage forex and mobile money operations." },
    ],
  }),
  component: Login,
});

function Login() {
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
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            toast.info("Sign-in is not connected yet. It will be enabled with authentication in Phase 2.");
          }}
        >
          <div>
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your staff account.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full">Sign in</Button>
          <p className="text-center text-xs text-muted-foreground">
            Preview mode — <Link to="/" className="underline">continue to dashboard</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
