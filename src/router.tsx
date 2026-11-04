import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new version is published, an open tab may ask for old page files
// that no longer exist. Reload once to pick up the new version.
if (typeof window !== "undefined") {
  const KEY = "findesk:chunk-reload";
  const reloadOnce = () => {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last > 10_000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  };
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    reloadOnce();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)) {
      reloadOnce();
    }
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
