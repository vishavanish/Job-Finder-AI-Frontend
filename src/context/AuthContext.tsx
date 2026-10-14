import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loginUser, registerUser } from "../api/client";
import { api, refreshAccessToken } from "../lib/api/client";
import { onSessionEnd, setAccessToken } from "../lib/auth/session";
import { purgeLegacySessionStorage } from "../lib/storage";
import type { TokenResponse, User } from "../lib/api/types";

export type AuthStatus = "loading" | "signed_in" | "signed_out";

export interface AuthValue {
  user: User | null;
  status: AuthStatus;
  /** Why the user was signed out (expired session, disabled account). Shown on /login. */
  notice: string | null;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, name?: string) => Promise<User>;
  /** For sign-in flows that return a TokenResponse directly (OTP, Google — F1). */
  acceptSession: (data: TokenResponse) => User;
  logout: () => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
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
        setStatus("signed_out");
        setNotice(end.message || null);
      }),
    [],
  );

  const acceptSession = useCallback((data: TokenResponse) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    setStatus("signed_in");
    setNotice(null);
    return data.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await loginUser({ email, password });
      return acceptSession(data);
    },
    [acceptSession],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const { data } = await registerUser({ email, password, name });
      return acceptSession(data);
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    try {
      // Revokes the refresh cookie server-side. The pre-Phase-1 backend has no
      // such route; a failure here must not keep the user signed in locally.
      await api.post<void>("/auth/logout");
    } catch {
      // ignored on purpose
    }
    setAccessToken(null);
    setUser(null);
    setStatus("signed_out");
    setNotice(null);
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo(
    () => ({ user, status, notice, login, register, acceptSession, logout, clearNotice }),
    [user, status, notice, login, register, acceptSession, logout, clearNotice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
