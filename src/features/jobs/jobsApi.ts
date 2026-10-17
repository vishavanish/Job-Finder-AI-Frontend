/** Streaming search runs, the user's job lists and the two apply paths (backend P3–P3.2, F3 endpoints). */
import { api } from "../../lib/api/client";
import type {
  ApplicantInfo,
  ApplicationLogEntry,
  PipelineRunJobsPage,
  PipelineRunMeta,
  StreamedJob,
  TaskResponse,
  UserJob,
  UserJobList,
} from "../../lib/api/types";

export interface RunStarted {
  run_id: string;
  keywords?: string[];
  skipped_sources?: string[];
}

export interface StartRunBody {
  search_profile_id: string;
  include_seen?: boolean;
  thresholds?: { llm_min_score_to_keep?: number; keyword_prefilter_min_pct?: number };
}

export type JobListState = "saved" | "applied" | "hidden" | "seen";

export const jobKeys = {
  list: (state: JobListState) => ["jobs", state] as const,
};

export const startRun = (body: StartRunBody) => api.post<RunStarted>("/pipeline/run/stream", body);
export const getRun = (runId: string) =>
  api.get<PipelineRunMeta>(`/pipeline/${encodeURIComponent(runId)}`);
export const getRunJobs = (runId: string, offset: number) =>
  api.get<PipelineRunJobsPage>(`/pipeline/${encodeURIComponent(runId)}/jobs`, {
    params: { offset },
  });
export const cancelRun = (runId: string) =>
  api.post<PipelineRunMeta>(`/pipeline/${encodeURIComponent(runId)}/cancel`);

export const listJobs = (state: JobListState, limit = 100, offset = 0) =>
  api.get<UserJobList>("/jobs", { params: { state, limit, offset } });
export const setJobState = (jobId: string, action: "save" | "hide" | "seen") =>
  api.post<UserJob>(`/jobs/${encodeURIComponent(jobId)}/${action}`);

export const markApplied = (jobId: string) =>
  api.post<ApplicationLogEntry>("/applications/manual", { job_id: jobId });

export const startAutoApply = (job: StreamedJob, applicant: ApplicantInfo) =>
  api.post<TaskResponse>("/apply", {
    jobs: [
      {
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        description: job.description,
        posted: job.posted,
      },
    ],
    applicant_info: applicant,
    open_top_n: 1,
    auto_fill_easy_apply: true,
  });

export const getTask = (taskId: string) =>
  api.get<TaskResponse>(`/tasks/${encodeURIComponent(taskId)}`);

/** A saved/applied/hidden job in the same shape as a feed entry, so one card renders both. */
export function userJobToCard(j: UserJob): StreamedJob {
  return {
    id: j.id,
    source: j.source,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    description: "",
    posted: j.posted,
    keyword_score: j.keyword_score ?? null,
    llm_score: j.llm_score ?? null,
    llm_reason: j.reason ?? "",
    auto_apply_capable: j.source === "LinkedIn",
    created_at: j.updated_at,
    match: (j.match as StreamedJob["match"]) ?? null,
    posted_at: j.posted_at ?? null,
    posted_hours_ago: j.posted_hours_ago ?? null,
    early: Boolean(j.early),
    applicants: j.applicants ?? null,
  };
}
