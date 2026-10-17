/** Saved job alerts (backend P3.2). */
import { api } from "../../lib/api/client";
import type {
  AlertIn,
  AlertList,
  AlertOut,
  AlertRunJobs,
  AlertRunList,
  TaskResponse,
} from "../../lib/api/types";

export const alertKeys = {
  all: ["alerts"] as const,
  runs: (id: string) => ["alerts", id, "runs"] as const,
  runJobs: (runId: string) => ["alerts", "run", runId] as const,
};

export const listAlerts = () => api.get<AlertList>("/alerts");
export const createAlert = (body: AlertIn) => api.post<AlertOut>("/alerts", body);
export const updateAlert = (id: string, body: AlertIn) =>
  api.put<AlertOut>(`/alerts/${encodeURIComponent(id)}`, body);
export const deleteAlert = (id: string) => api.delete<void>(`/alerts/${encodeURIComponent(id)}`);
export const runAlertNow = (id: string) =>
  api.post<TaskResponse>(`/alerts/${encodeURIComponent(id)}/run-now`);
export const listAlertRuns = (id: string) =>
  api.get<AlertRunList>(`/alerts/${encodeURIComponent(id)}/runs`);
export const getAlertRunJobs = (runId: string) =>
  api.get<AlertRunJobs>(`/alerts/runs/${encodeURIComponent(runId)}/jobs`);
