/* eslint-disable no-restricted-globals -- one-time read and delete of the pre-F6 ATS targets. */
/**
 * Before F6 the ATS targets page kept a list of platform + slug "targets" in
 * localStorage that nothing searched. F6 offers to add them to the shared
 * registry once (POST /ats/companies), then deletes them.
 */
import type { AtsCompanyIn } from "../../lib/api/types";

export const ATS_TARGETS_KEY = "job_finder_ats_targets_v1";
const LEGACY_SETTINGS_KEY = "job_finder_settings_v1";
/** What the old page saved for everyone who never changed it. */
const OLD_DEFAULT = '[{"platform":"smartrecruiters","slug":"Atlassian"}]';

export interface LegacyTarget {
  platform: string;
  slug: string;
  custom_endpoint_url?: string;
}

function parse(raw: string | null): LegacyTarget[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (t): t is LegacyTarget =>
        typeof t === "object" &&
        t !== null &&
        typeof (t as LegacyTarget).platform === "string" &&
        typeof (t as LegacyTarget).slug === "string" &&
        Boolean((t as LegacyTarget).slug.trim()),
    );
  } catch {
    return [];
  }
}

/** Saved targets, from their own key or (older) the pre-F3 settings. The untouched default counts as none. */
export function readLegacyTargets(): LegacyTarget[] {
  try {
    const own = localStorage.getItem(ATS_TARGETS_KEY);
    if (own !== null) return own.replace(/\s/g, "") === OLD_DEFAULT ? [] : parse(own);
    const settings = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const targets = settings ? (JSON.parse(settings) as { atsTargets?: unknown }).atsTargets : null;
    return parse(JSON.stringify(targets ?? []));
  } catch {
    return [];
  }
}

/** Keeps the targets when the pre-F3 settings are deleted (search-profile import). */
export function keepLegacyTargets(): void {
  try {
    if (localStorage.getItem(ATS_TARGETS_KEY) !== null) return;
    const settings = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const targets = settings ? (JSON.parse(settings) as { atsTargets?: unknown }).atsTargets : null;
    if (Array.isArray(targets) && targets.length) {
      localStorage.setItem(ATS_TARGETS_KEY, JSON.stringify(targets));
    }
  } catch {
    // Nothing to keep.
  }
}

export function forgetLegacyTargets(): void {
  try {
    localStorage.removeItem(ATS_TARGETS_KEY);
  } catch {
    // Nothing to remove.
  }
}

/** The registry request for a target; custom endpoints and SuccessFactors aren't in the registry. */
export function targetToCompany(t: LegacyTarget): AtsCompanyIn | null {
  const platform = t.platform.toLowerCase();
  if (platform === "custom" || platform === "successfactors" || platform === "oracle") return null;
  return { platform, slug: t.slug.trim() };
}
