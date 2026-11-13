import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useSession } from "@/hooks/use-session";

/**
 * The staff sign-in lives at /staff-portal. This address used to be it, and
 * customers still reach it from old links and bookmarks, so it now sends them
 * somewhere useful: signed-in staff go to the dashboard, everyone else to the
 * public request page.
 */
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Request a service — FinDesk" },
      {
        name: "description",
        content: "Send a service request to the branch and follow the answer in one thread.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginRedirect,
});

function LoginRedirect() {
  const { status } = useSession();
  // Wait for the session before choosing, so a signed-in member of staff is not
  // briefly bounced to the customer page.
  if (status === "loading" || status === "loading_viewer") return null;
  return <Navigate to={status === "signed_in" ? "/" : "/request"} replace />;
}
