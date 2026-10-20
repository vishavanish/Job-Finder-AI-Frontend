/**
 * Endpoint helpers used by the pre-F0 screens. Same names and `{ data }` return
 * shape as the old axios module, now backed by the single client in lib/api.
 * The base URL comes from VITE_API_BASE_URL (see .env.*) instead of a constant.
 *
 * New features should call `api` from lib/api/client directly (or via
 * TanStack Query hooks once those land) instead of adding helpers here.
 */
import { api } from "../lib/api/client";
import type {
  ApplicationLogEntry,
  ApplicationLogResult,
  CompanyAtsRequest,
  PipelineRequest,
  PipelineRunJobsPage,
  PipelineRunMeta,
  PipelineRunStarted,
  ScoreRequest,
  SearchRequest,
  TaskResponse,
} from "../lib/api/types";

async function withData<T>(promise: Promise<T>): Promise<{ data: T }> {
  return { data: await promise };
}

// ---- search / score / apply / pipeline ----
export const startSearch = (payload: SearchRequest) =>
  withData(api.post<TaskResponse>("/search", payload));

export const startScore = (payload: ScoreRequest) =>
  withData(api.post<TaskResponse>("/score", payload));

export const runPipeline = (payload: PipelineRequest) =>
  withData(api.post<TaskResponse>("/pipeline/run", payload));

export const startPipelineStream = (payload: PipelineRequest) =>
  withData(api.post<PipelineRunStarted>("/pipeline/run/stream", payload));

export const getPipelineRun = (runId: string) =>
  withData(api.get<PipelineRunMeta>(`/pipeline/${runId}`));

export const getPipelineRunJobs = (runId: string, offset = 0) =>
  withData(api.get<PipelineRunJobsPage>(`/pipeline/${runId}/jobs`, { params: { offset } }));

export const getTask = (taskId: string) => withData(api.get<TaskResponse>(`/tasks/${taskId}`));

export const cancelTask = (taskId: string) =>
  withData(api.post<unknown>(`/tasks/${taskId}/cancel`));

export const fetchCompanyAts = (payload: CompanyAtsRequest) =>
  withData(api.post<TaskResponse>("/company-ats/fetch", payload));

export const listApplications = (params?: { limit?: number; offset?: number }) =>
  withData(api.get<ApplicationLogResult>("/applications", { params }));

export const getApplication = (id: string) =>
  withData(api.get<ApplicationLogEntry>(`/applications/${id}`));

export const updateApplicationStatus = (id: string, status: string) =>
  withData(api.patch<ApplicationLogEntry>(`/applications/${id}`, { status }));

const FINISHED = new Set(["completed", "failed", "cancelled", "revoked"]);

export async function pollTask(
  taskId: string,
  {
    intervalMs = 2500,
    maxAttempts = 300,
    onUpdate,
  }: { intervalMs?: number; maxAttempts?: number; onUpdate?: (task: TaskResponse) => void } = {},
): Promise<TaskResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data } = await getTask(taskId);
    onUpdate?.(data);
    if (FINISHED.has(data.status)) return data;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `The task is still not finished after ${maxAttempts} checks. It may be stuck; try cancelling it.`,
  );
}
