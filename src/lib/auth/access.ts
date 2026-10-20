/**
 * What the signed-in user may use (spec §5.2). UX only: the backend enforces
 * every rule. Components that render guards live in app/guards.tsx.
 */
import { useAuth } from "../../context/AuthContext";

export type Role = "user" | "manager" | "admin";

/** Same wording as the backend's FEATURE_LABELS (app/services/entitlements.py). */
export const FEATURE_LABELS: Record<string, string> = {
  job_search: "job search",
  scoring: "AI job scoring",
  ats_discovery: "company career pages",
  auto_apply: "auto apply",
  gmail_tracking: "Gmail tracking",
  voice_prep: "interview practice",
  live_copilot: "Live Copilot",
  resume_tailoring: "resume tailoring",
  premium_models: "premium AI models",
  job_alerts: "job alerts",
};

export function featureLabel(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature.replace(/_/g, " ");
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface EntitlementState {
  /** False only when we know the user can't use it right now. */
  allowed: boolean;
  /** Why not, in plain words. Empty when allowed. */
  reason: string;
  /** Uses left today; null = unlimited or unknown. */
  remaining: number | null;
  maxLevel: number | null;
}

export function useEntitlement(feature: string): EntitlementState {
  const { entitlements } = useAuth();
  const e = entitlements?.[feature];
  // Not loaded yet, or an older backend without entitlements: let the backend decide.
  if (!entitlements || !e) return { allowed: true, reason: "", remaining: null, maxLevel: null };

  const label = featureLabel(feature);
  if (!e.enabled) {
    return {
      allowed: false,
      reason: `Your account doesn't include ${label}. Ask your admin to turn it on.`,
      remaining: null,
      maxLevel: e.max_level ?? null,
    };
  }
  const remaining = e.quota_remaining ?? null;
  if (remaining !== null && remaining <= 0) {
    return {
      allowed: false,
      reason: `You've used all ${e.quota_per_day ?? 0} of today's ${label} runs. The limit resets at 00:00 UTC.`,
      remaining: 0,
      maxLevel: e.max_level ?? null,
    };
  }
  return { allowed: true, reason: "", remaining, maxLevel: e.max_level ?? null };
}

export function hasRole(role: string | undefined | null, roles: readonly Role[]): boolean {
  return Boolean(role && (roles as readonly string[]).includes(role));
}
