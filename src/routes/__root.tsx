import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { BrandingProvider } from "@/hooks/use-branding";
import { LanguageProvider, useLanguage } from "@/hooks/use-language";
import { SessionProvider } from "@/hooks/use-session";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("Page not found")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("The page you're looking for doesn't exist or has been moved.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Go home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Every deploy replaces the hashed asset files. A tab opened before a deploy
 * therefore asks for chunks that no longer exist, and the route dies with an
 * import failure that "Try again" cannot fix. Recognising it lets the page
 * reload itself once, which is the only recovery that works.
 */
function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch dynamically imported module|importing a module script failed|chunkloaderror|error loading dynamically imported module/i.test(
    message,
  );
}

const STALE_CHUNK_RELOAD_KEY = "findesk-stale-chunk-reload";

/** True when a reload is worth trying, and never more than once every 15 s. */
function shouldReloadForStaleChunk(): boolean {
  try {
    const previous = Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - previous < 15_000) return false;
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const { t } = useLanguage();
  const router = useRouter();
  const staleChunk = isStaleChunkError(error);
  const detail = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    if (staleChunk && shouldReloadForStaleChunk()) window.location.reload();
  }, [error, staleChunk]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {staleChunk ? t("A new version of the app is available") : t("This page didn't load")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staleChunk
            ? t("Reload the page to continue.")
            : t("Something went wrong on our end. You can try refreshing or head back home.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (staleChunk) {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {staleChunk ? t("Reload") : t("Try again")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("Go home")}
          </a>
        </div>
        {!staleChunk && detail ? (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t("Technical details")}
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-[11px] text-muted-foreground">
              {detail}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FinDesk" },
      {
        name: "description",
        content: "Forex Bureau and Mobile Money agency management for Uganda.",
      },
      { property: "og:title", content: "FinDesk" },
      {
        property: "og:description",
        content: "Forex Bureau and Mobile Money agency management for Uganda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <LanguageProvider>
          <SessionProvider>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </SessionProvider>
          <Toaster />
        </LanguageProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}
