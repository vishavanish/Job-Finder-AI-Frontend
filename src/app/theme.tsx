import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { readPref, writePref } from "../lib/storage";

export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "jf_theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

function readThemePref(): ThemePref {
  const raw = readPref(THEME_KEY);
  return raw === "light" || raw === "dark" ? raw : "system";
}

function apply(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

interface ThemeValue {
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readThemePref);

  useEffect(() => {
    apply(pref);
    if (pref !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const setPref = useCallback((next: ThemePref) => {
    writePref(THEME_KEY, next);
    setPrefState(next);
  }, []);

  return <ThemeContext.Provider value={{ pref, setPref }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
