/** Apply Center calls (backend P4a / P4b / P4c): apply runs, prep packs, answer bank, apply settings. */
import { api } from "../../lib/api/client";
import type {
  ApplicationLogEntry,
  ApplyOptions,
  ApplyProof,
  ApplyRun,
  ApplyRunList,
  ApplyRunState,
  ApplySettings,
  ApplySettingsIn,
  PrepPack,
  SavedAnswer,
  SavedAnswerIn,
  SavedAnswerList,
} from "../../lib/api/types";

const enc = encodeURIComponent;

/** Runs that need the user, those still moving, and finished ones (the Apply Center tabs). */
export const WAITING_STATES: readonly ApplyRunState[] = [
  "awaiting_input",
  "awaiting_review",
  "needs_user",
];
export const ACTIVE_STATES: readonly ApplyRunState[] = ["queued", "preparing", "submitting"];
export const HISTORY_STATES: readonly ApplyRunState[] = [
  "submitted",
  "done",
  "cancelled",
  "failed",
];

export const isRunMoving = (state: ApplyRunState | undefined) =>
  state !== undefined && (ACTIVE_STATES as readonly string[]).includes(state);

/** One page of a form the AI form reader walked (backend P4c `steps`). */
export interface RunStep {
  page: number;
  url: string;
  keys: string[];
  files: Record<string, string>;
}

/** What the screenshot fallback did on a run (backend P4c `vision`); the log never holds answers. */
export interface RunVision {
  steps: number;
  cost_usd: number;
  map_calls: number;
  log: { action?: string; mark?: string; key?: string; refused?: string; stop?: string }[];
}

export const runSteps = (run: ApplyRun): RunStep[] => (run.steps ?? []) as unknown as RunStep[];
export const runVision = (run: ApplyRun): RunVision | null =>
  (run.vision as unknown as RunVision | null | undefined) ?? null;
export const isGeneric = (adapter: string | null | undefined) => adapter === "generic";

export const applyKeys = {
  all: ["apply"] as const,
  runs: (filter: string) => ["apply", "runs", filter] as const,
  run: (id: string) => ["apply", "run", id] as const,
  jobRuns: (jobId: string) => ["apply", "runs", "job", jobId] as const,
  waitingCount: ["apply", "runs", "waiting-count"] as const,
  pack: (id: string) => ["apply", "pack", id] as const,
  proofs: (runId: string) => ["apply", "proofs", runId] as const,
  settings: ["apply", "settings"] as const,
  answers: ["apply", "answers"] as const,
};

// ---- runs ----
export const startApplyRun = (jobId: string, mode: "auto" | "fast") =>
  api.post<ApplyRun>("/apply/runs", { job_id: jobId, mode });

export const listRuns = (state?: string, jobId?: string, limit = 100) =>
  api.get<ApplyRunList>("/apply/runs", { params: { state, job_id: jobId, limit } });

export const getRun = (id: string) => api.get<ApplyRun>(`/apply/runs/${enc(id)}`);
export const answerRun = (id: string, answers: Record<string, string>) =>
  api.post<ApplyRun>(`/apply/runs/${enc(id)}/answer`, { answers });
export const approveRun = (id: string) => api.post<ApplyRun>(`/apply/runs/${enc(id)}/approve`);
export const cancelApplyRun = (id: string) => api.post<ApplyRun>(`/apply/runs/${enc(id)}/cancel`);
export const finishRun = (id: string, submitted: boolean) =>
  api.post<ApplyRun>(`/apply/runs/${enc(id)}/done`, { submitted });
export const listProofs = (runId: string) =>
  api.get<ApplyProof[]>(`/apply/runs/${enc(runId)}/proofs`);
export const proofImage = (runId: string, proofId: string) =>
  api.blob(`/apply/runs/${enc(runId)}/proofs/${enc(proofId)}`);

export const getApplyOptions = (jobId: string) =>
  api.get<ApplyOptions>(`/apply/options/${enc(jobId)}`);

// ---- prep pack ----
export const requestPrep = (
  jobId: string,
  opts: { tailor_resume?: boolean; cover_letter?: boolean; regenerate?: boolean } = {},
) =>
  api.post<PrepPack>("/apply/prep", {
    job_id: jobId,
    tailor_resume: opts.tailor_resume ?? true,
    cover_letter: opts.cover_letter ?? true,
    regenerate: opts.regenerate ?? false,
  });
export const getPrep = (id: string) => api.get<PrepPack>(`/apply/prep/${enc(id)}`);
export const resumeFile = (resumeId: string) => api.blob(`/resumes/${enc(resumeId)}/file`);

/** "I applied on the page" (submitted) or "I sent the email" (emailed). */
export const markApplied = (jobId: string, via: "manual" | "email" = "manual") =>
  api.post<ApplicationLogEntry>("/applications/manual", { job_id: jobId, via });

// ---- settings ----
export const getApplySettings = () => api.get<ApplySettings>("/apply/settings");
export const putApplySettings = (body: ApplySettingsIn) =>
  api.put<ApplySettings>("/apply/settings", body);

// ---- answer bank ----
export const listAnswers = () => api.get<SavedAnswerList>("/answer-bank");
export const saveAnswer = (body: SavedAnswerIn) => api.post<SavedAnswer>("/answer-bank", body);
export const updateAnswer = (id: string, body: { answer?: string; approved?: boolean }) =>
  api.put<SavedAnswer>(`/answer-bank/${enc(id)}`, body);
export const approveAnswer = (id: string) =>
  api.post<SavedAnswer>(`/answer-bank/${enc(id)}/approve`);
export const deleteAnswer = (id: string) => api.delete<void>(`/answer-bank/${enc(id)}`);

/** Saves a downloaded file under `name` (the blob never touches storage). */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
