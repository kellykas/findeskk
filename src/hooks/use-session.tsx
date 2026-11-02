import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import {
  authErrorMessage,
  getSession,
  onAuthStateChange,
  signIn as signInRequest,
  signOut as signOutRequest,
  viewerQuery,
  type Viewer,
} from "@/services/auth.service";

export type SessionStatus = "loading" | "signed_out" | "loading_viewer" | "signed_in";

interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  viewer: Viewer | null;
  viewerError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshViewer: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/**
 * Holds the Supabase session and the signed-in viewer (profile, roles,
 * branches). The session is resolved in the browser only, so nothing here runs
 * during SSR; protected pages render a loading state until it resolves.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    getSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch(() => {
        if (active) setSession(null);
      });

    const unsubscribe = onAuthStateChange((next) => {
      if (active) setSession(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const viewerResult = useQuery({
    ...viewerQuery(session?.user.id ?? "", session?.user.email ?? null),
    enabled: Boolean(session),
    retry: false,
  });

  const value = useMemo<SessionContextValue>(() => {
    const status: SessionStatus =
      session === undefined
        ? "loading"
        : session === null
          ? "signed_out"
          : viewerResult.isPending
            ? "loading_viewer"
            : "signed_in";

    return {
      status,
      session: session ?? null,
      viewer: viewerResult.data ?? null,
      viewerError: viewerResult.error
        ? authErrorMessage((viewerResult.error as Error).message)
        : null,
      signIn: async (email, password) => {
        await signInRequest(email, password);
        setSession((await getSession()) ?? null);
      },
      signOut: async () => {
        await signOutRequest();
        queryClient.removeQueries({ queryKey: ["viewer"] });
        setSession(null);
      },
      refreshViewer: async () => {
        await queryClient.invalidateQueries({ queryKey: ["viewer"] });
      },
    };
  }, [session, viewerResult.data, viewerResult.error, viewerResult.isPending, queryClient]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
