/* eslint-disable no-restricted-globals -- this module is the one sanctioned place for browser storage. */

/**
 * Per-browser UI preferences only (theme, collapsed panels).
 * Never tokens, keys or personal data — see docs/frontend-audit.md.
 * Storage can be unavailable (private mode, blocked site data), so every call is guarded.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference simply isn't remembered.
  }
}

/** Keys the pre-F0 app used to keep the access token and user in localStorage. */
const LEGACY_SESSION_KEYS = ["job_finder_access_token", "job_finder_user"];

/** Remove tokens left behind by the old client. Safe to call on every start. */
export function purgeLegacySessionStorage(): void {
  try {
    for (const key of LEGACY_SESSION_KEYS) localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
