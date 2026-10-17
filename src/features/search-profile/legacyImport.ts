/* eslint-disable no-restricted-globals -- one-time read and delete of the pre-F3 browser settings. */
/**
 * Before F3 the app kept keywords, skills, the resume summary and applicant
 * info in localStorage (audit S4). This reads them once so the user can move
 * them to the server, then deletes them. ATS targets live under their own key until F6.
 */
import type { ApplicantInfoIn, SearchProfileIn } from "../../lib/api/types";

export const LEGACY_SETTINGS_KEY = "job_finder_settings_v1";

export interface LegacySettings {
  keywords?: string[];
  locations?: string[];
  skills?: string[];
  careerTargets?: string[];
  resumeSummary?: string;
  applicant?: Partial<Record<"first_name" | "last_name" | "email" | "phone", string>>;
  atsTargets?: unknown[];
}

export function readLegacySettings(): LegacySettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacySettings;
    const hasSearch = Boolean(
      parsed.keywords?.length || parsed.skills?.length || parsed.careerTargets?.length,
    );
    const hasApplicant = Object.values(parsed.applicant ?? {}).some(Boolean);
    return hasSearch || hasApplicant ? parsed : null;
  } catch {
    return null;
  }
}

/** Deletes the old settings. ATS targets were already copied to their own key by SettingsContext. */
export function forgetLegacySettings(): void {
  try {
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // Nothing to remove.
  }
}

export function legacyToProfile(s: LegacySettings, name = "Imported search"): SearchProfileIn {
  const titles = [...new Set([...(s.keywords ?? []), ...(s.careerTargets ?? [])])].slice(0, 30);
  const skills = [...new Set((s.skills ?? []).map((x) => x.trim()).filter(Boolean))]
    .slice(0, 100)
    .map((skill) => ({ name: skill, weight: "strong" as const, synonyms: [], years: null }));
  return { name, is_default: true, titles, skills, must_have: [], nice_to_have: [], exclude: [] };
}

export function legacyApplicant(s: LegacySettings, current: ApplicantInfoIn): ApplicantInfoIn {
  const a = s.applicant ?? {};
  return {
    ...current,
    first_name: current.first_name || a.first_name || "",
    last_name: current.last_name || a.last_name || "",
    email: current.email || a.email || "",
    phone: current.phone || a.phone || "",
  };
}
