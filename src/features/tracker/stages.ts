/**
 * How the tracker groups and words statuses: kanban stages, where a change
 * came from, what an email means, and the statuses the user can pick.
 */
import type { ApplicationStatus, ResolveCategory } from "../../lib/api/types";

export const STAGES = [
  { id: "progress", label: "In progress" },
  { id: "applied", label: "Applied" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "assessment", label: "Assessment" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "closed", label: "Closed" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

const STAGE_BY_STATUS: Record<string, StageId> = {
  submitted: "applied",
  emailed: "applied",
  done: "applied",
  acknowledged: "acknowledged",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  accepted: "offer",
  rejected: "closed",
  declined: "closed",
  withdrawn: "closed",
  ghosted: "closed",
};

/** Anything not yet sent (opened, prefilled, a run waiting for the user, a failed open) is "In progress". */
export function stageOf(status: string): StageId {
  return STAGE_BY_STATUS[status.trim().toLowerCase()] ?? "progress";
}

export function stageLabel(id: string): string {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

const SOURCE_LABELS: Record<string, string> = {
  apply_engine: "Apply engine",
  manual: "You",
  email_parser: "From an email",
  browser_apply: "Browser apply",
};

/** Where a status change came from, in plain words. */
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "Unknown";
  return SOURCE_LABELS[source] ?? source.replace(/[_-]+/g, " ");
}

/** Every status the user can set by hand (PATCH /applications/{id}), in funnel order. */
export const MANUAL_STATUSES: readonly ApplicationStatus[] = [
  "opened",
  "submitted",
  "emailed",
  "acknowledged",
  "assessment",
  "interview",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
];

/** Once an application has one of these, email tracking never changes it again. */
export const CLOSED_STATUSES: readonly string[] = ["accepted", "declined", "withdrawn", "rejected"];

export const CATEGORY_LABELS: Record<string, string> = {
  acknowledgement: "Acknowledgement",
  assessment: "Assessment",
  interview_invite: "Interview invite",
  offer: "Offer",
  rejection: "Rejection",
  job_alert: "Job alert",
  other: "Not about an application",
};

/** The status an email category moves an application to (backend email_sync.CATEGORY_STATUS). */
export const CATEGORY_STATUS: Record<ResolveCategory, ApplicationStatus> = {
  acknowledgement: "acknowledged",
  assessment: "assessment",
  interview_invite: "interview",
  offer: "offer",
  rejection: "rejected",
};

export const RESOLVE_CATEGORIES = Object.keys(CATEGORY_STATUS) as ResolveCategory[];

export function categoryLabel(c: string | null | undefined): string {
  return c ? (CATEGORY_LABELS[c] ?? c) : "Unknown";
}

/** Only real Gmail links are rendered as links. */
export function safeGmailUrl(url: string | null | undefined): string | null {
  return url && url.startsWith("https://mail.google.com/") ? url : null;
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return withTime
    ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}
