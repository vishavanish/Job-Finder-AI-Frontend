import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "job_finder_settings_v1";

const DEFAULT_SETTINGS = {
  keywords: [
    "Senior Python Software Engineer",
    "AI Engineer",
    "LLM Application Developer",
  ],
  locations: ["Mumbai, India", "Pune, India", "Bangalore, India"],
  // Job sources moved to the server (GET/PUT /providers) in F2.

  skills: [
    "python", "django", "fastapi", "docker", "aws",
    "langchain", "sql", "react",
  ],
  resumeSummary:
    "Senior Software Developer (3+ yrs). Core stack: Python, Django, FastAPI, Docker, AWS, LangChain, SQL, React.",
  careerTargets: ["AI Engineer", "LLM Application Developer", "Senior Backend Developer"],

  atsTargets: [
    { platform: "smartrecruiters", slug: "Atlassian" },
  ],

  thresholds: {
    keywordPrefilterMinPct: 30,
    llmTopNToRank: 40,
    llmMinScoreToKeep: 70,
    resultsPerKeyword: 25,
    maxAgeHours: 24,
  },

  applicant: { first_name: "", last_name: "", email: "", phone: "" },
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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
