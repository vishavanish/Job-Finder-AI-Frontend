import { createContext, useContext, useEffect, useState } from "react";

// F3: search settings, resume summary and applicant info moved to the server
// (/search-profiles, /preferences, /profile). Only ATS targets stay in the
// browser until ATS Discovery (F6), under their own key so importing or
// discarding the old settings (features/search-profile/legacyImport.ts)
// can't lose them.
const ATS_KEY = "job_finder_ats_targets_v1";
const LEGACY_KEY = "job_finder_settings_v1";
const DEFAULT_TARGETS = [{ platform: "smartrecruiters", slug: "Atlassian" }];

function loadTargets() {
  try {
    const own = localStorage.getItem(ATS_KEY);
    if (own) return JSON.parse(own);
    const legacy = localStorage.getItem(LEGACY_KEY);
    const targets = legacy ? JSON.parse(legacy).atsTargets : null;
    return Array.isArray(targets) ? targets : DEFAULT_TARGETS;
  } catch {
    return DEFAULT_TARGETS;
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ atsTargets: loadTargets() }));

  useEffect(() => {
    try {
      localStorage.setItem(ATS_KEY, JSON.stringify(settings.atsTargets));
    } catch {
      // Not remembered in this browser.
    }
  }, [settings.atsTargets]);

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }));

  return (
    <SettingsContext.Provider value={{ settings, setSettings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
