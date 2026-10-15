import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, refreshAccessToken } from "../lib/api/client";
import { onSessionEnd, setAccessToken } from "../lib/auth/session";
import { purgeLegacySessionStorage } from "../lib/storage";
import { fetchMe } from "../features/auth/authApi";
import type { EntitlementSummary, TokenResponse, User } from "../lib/api/types";

export type AuthStatus = "loading" | "signed_in" | "signed_out";

export interface AuthValue {
  user: User | null;
  status: AuthStatus;
  /**
   * What the user may use, from GET /auth/me. null until loaded (or if the
   * backend predates Phase 1); guards then allow and let the backend decide.
   */
  entitlements: Record<string, EntitlementSummary> | null;
  /** Why the user was signed out (expired session, disabled account). Shown on /login. */
  notice: string | null;
  /** For sign-in flows that return a TokenResponse (OTP, Google). */
  acceptSession: (data: TokenResponse) => User;
  /** Re-reads role and entitlements (e.g. after an admin changed them). */
  reloadMe: () => Promise<void>;
  logout: () => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [entitlements, setEntitlements] = useState<Record<string, EntitlementSummary> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Restore the session from the httpOnly refresh cookie. refreshAccessToken is
  // single-flight, so StrictMode's double effect still sends one request.
  useEffect(() => {
    purgeLegacySessionStorage();
    let active = true;
    refreshAccessToken().then((data) => {
      if (!active) return;
      if (data) {
        setUser(data.user);
        setStatus("signed_in");
      } else {
        setStatus((s) => (s === "loading" ? "signed_out" : s));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      onSessionEnd((end) => {
        setUser(null);
        setEntitlements(null);
        setStatus("signed_out");
        setNotice(end.message || null);
      }),
    [],
  );

  const reloadMe = useCallback(async () => {
    try {
      const me = await fetchMe();
      const { entitlements: ent, ...rest } = me;
      setUser(rest);
      setEntitlements(ent ?? {});
    } catch {
      // A 401/403 already ended the session in the client; anything else keeps
      // the last known values (the backend still enforces every rule).
    }
  }, []);

  // Load role and entitlements once signed in, and again when the tab comes
  // back into view, so changes an admin made show up without a reload.
  useEffect(() => {
    if (status !== "signed_in") return;
    void reloadMe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadMe();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, reloadMe]);

  const acceptSession = useCallback((data: TokenResponse) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    setEntitlements(null);
    setStatus("signed_in");
    setNotice(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revokes the refresh cookie server-side. A failure here must not keep
      // the user signed in locally.
      await api.post<void>("/auth/logout");
    } catch {
      // ignored on purpose
    }
    setAccessToken(null);
    setUser(null);
    setEntitlements(null);
    setStatus("signed_out");
    setNotice(null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({
      user,
      status,
      entitlements,
      notice,
      acceptSession,
      reloadMe,
      logout,
      clearNotice,
    }),
    [user, status, entitlements, notice, acceptSession, reloadMe, logout, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
