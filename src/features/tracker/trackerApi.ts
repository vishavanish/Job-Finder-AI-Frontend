/** Tracker and Gmail calls (backend P5): applications, stats, timelines, Gmail accounts, the review inbox. */
import { api } from "../../lib/api/client";
import type {
  ApplicationLogEntry,
  ApplicationLogResult,
  ApplicationStatus,
  ApplicationTimeline,
  EmailEvent,
  EmailEventList,
  GmailAccountList,
  GmailConnect,
  ResolveIn,
  TrackerStats,
} from "../../lib/api/types";

const enc = encodeURIComponent;

/** The tracker loads this many (newest first) and searches them on the client (plan decision 8). */
export const TRACKER_LIMIT = 500;

export interface ApplicationFilters {
  status?: string;
  company?: string;
  source?: string;
  since?: string;
}

export const trackerKeys = {
  all: ["tracker"] as const,
  applications: (f: ApplicationFilters) => ["tracker", "applications", f] as const,
  application: (id: string) => ["tracker", "application", id] as const,
  timeline: (id: string) => ["tracker", "timeline", id] as const,
  stats: ["tracker", "stats"] as const,
  review: ["tracker", "review"] as const,
  accounts: ["gmail", "accounts"] as const,
};

export const listApplications = (f: ApplicationFilters, limit = TRACKER_LIMIT) =>
  api.get<ApplicationLogResult>("/applications", {
    params: {
      status: f.status || undefined,
      company: f.company || undefined,
      source: f.source || undefined,
      since: f.since || undefined,
      limit,
    },
  });

export const getApplication = (id: string) =>
  api.get<ApplicationLogEntry>(`/applications/${enc(id)}`);
export const getTimeline = (id: string) =>
  api.get<ApplicationTimeline>(`/applications/${enc(id)}/events`);
export const setApplicationStatus = (id: string, status: ApplicationStatus) =>
  api.patch<ApplicationLogEntry>(`/applications/${enc(id)}`, { status });
export const getStats = () => api.get<TrackerStats>("/applications/stats");

// ---- Gmail ----
export const gmailConnectUrl = () => api.get<GmailConnect>("/gmail/connect");
export const listGmailAccounts = () => api.get<GmailAccountList>("/gmail/accounts");
export const syncGmailAccount = (id: string) =>
  api.post<{ queued: boolean; message: string }>(`/gmail/accounts/${enc(id)}/sync`);
export const disconnectGmailAccount = (id: string) =>
  api.delete<void>(`/gmail/accounts/${enc(id)}`);
export const listReview = () => api.get<EmailEventList>("/gmail/review");
export const resolveReview = (id: string, body: ResolveIn) =>
  api.post<EmailEvent>(`/gmail/review/${enc(id)}/resolve`, body);
