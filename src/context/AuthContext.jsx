import { createContext, useContext, useState, useCallback } from "react";
import { loginUser, registerUser } from "../api/client.js";

const TOKEN_STORAGE_KEY = "job_finder_access_token";
const USER_STORAGE_KEY = "job_finder_user";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || null);

  const persistSession = useCallback((accessToken, userData) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await loginUser({ email, password });
      persistSession(data.access_token, data.user);
      return data.user;
    },
    [persistSession]
  );

  const register = useCallback(
    async (email, password, name) => {
      const { data } = await registerUser({ email, password, name });
      persistSession(data.access_token, data.user);
      return data.user;
    },
    [persistSession]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}