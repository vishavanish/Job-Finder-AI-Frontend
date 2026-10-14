import type { IconName } from "./Icon";

/** Status groups from spec §3. "attention" is the amber "needs you" part of Active. */
export type StatusGroup =
  "neutral" | "active" | "attention" | "progress" | "positive" | "negative" | "muted";

const GROUP_BY_STATUS: Record<string, StatusGroup> = {
  // Neutral — nothing has happened yet
  discovered: "neutral",
  saved: "neutral",
  queued: "neutral",
  pending: "neutral",
  idle: "neutral",
  new: "neutral",
  // Active — work in flight
  preparing: "active",
  filling: "active",
  submitting: "active",
  running: "active",
  opened: "active",
  // Needs you
  awaiting_input: "attention",
  awaiting_review: "attention",
  needs_review: "attention",
  easy_apply_form_filled_awaiting_review: "attention",
  // Progress — the employer has it
  submitted: "progress",
  acknowledged: "progress",
  assessment: "progress",
  // Positive outcomes (and finished tasks)
  interview: "positive",
  offer: "positive",
  accepted: "positive",
  completed: "positive",
  // Negative
  rejected: "negative",
  failed: "negative",
  // Muted
  withdrawn: "muted",
  declined: "muted",
  hidden: "muted",
  ghosted: "muted",
  cancelled: "muted",
  revoked: "muted",
};

const LABELS: Record<string, string> = {
  easy_apply_form_filled_awaiting_review: "Prefilled, awaiting review",
  awaiting_input: "Needs your input",
  awaiting_review: "Awaiting your review",
  needs_review: "Needs review",
  ghosted: "No reply",
  revoked: "Cancelled",
};

export const GROUP_ICON: Record<StatusGroup, IconName> = {
  neutral: "circle",
  active: "spinner",
  attention: "alert",
  progress: "arrowRight",
  positive: "check",
  negative: "cross",
  muted: "minus",
};

function normalize(status: string): string {
  return status.trim().toLowerCase();
}

export function statusGroup(status: string | null | undefined): StatusGroup {
  if (!status) return "neutral";
  const key = normalize(status);
  if (key.startsWith("open_failed")) return "negative";
  return GROUP_BY_STATUS[key] ?? "neutral";
}

/** Sentence-case label for a backend status string. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const key = normalize(status);
  if (key.startsWith("open_failed")) return "Couldn't open";
  const known = LABELS[key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
