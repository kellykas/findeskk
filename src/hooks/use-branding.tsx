import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import {
  DEFAULT_APP_NAME,
  DEFAULT_BRAND_COLOR,
  DEFAULT_FAVICON,
  brandTheme,
  faviconType,
  type Branding,
} from "@/domain/branding";
import { brandingQuery } from "@/services/branding.service";

/**
 * Branding read by the whole app. Signed-out visitors fall back to the defaults
 * and simply see FinDesk, which is why the provider never blocks rendering.
 */
const FALLBACK: Branding = {
  appName: DEFAULT_APP_NAME,
  logoUrl: "",
  primary: DEFAULT_BRAND_COLOR,
};

const BrandingContext = createContext<Branding>(FALLBACK);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery(brandingQuery);
  const value = useMemo(() => data ?? FALLBACK, [data]);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // The palette is one colour in the database and a handful of CSS variables in
  // the browser, so every `bg-primary`, ring and sidebar state follows along.
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, color] of Object.entries(brandTheme(value.primary))) {
      root.style.setProperty(name, color);
    }
  }, [value.primary]);

  // Route head() blocks carry the product name; rewrite them for the tab title.
  useEffect(() => {
    if (value.appName === DEFAULT_APP_NAME) return;
    document.title = document.title.split(DEFAULT_APP_NAME).join(value.appName);
  }, [value.appName, pathname]);

  // The tab icon follows the uploaded logo, so a rebrand shows up in the browser
  // tab as well as in the sidebar. Without a logo it stays the FinDesk mark.
  // Head attributes can be rewritten by a route change, so this runs again on
  // navigation as well as when the logo changes.
  useEffect(() => {
    const head = document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      head.appendChild(link);
    }
    const logo = value.logoUrl.trim();
    link.href = logo || DEFAULT_FAVICON;
    link.type = logo ? faviconType(logo) : "image/x-icon";
  }, [value.logoUrl, pathname]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
