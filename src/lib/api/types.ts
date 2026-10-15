/**
 * Friendly names for the generated OpenAPI types. Regenerate the source with
 * `npm run api:snapshot && npm run gen:api` when the backend contract changes.
 */
import type { components } from "./schema";

type Schemas = components["schemas"];

export type User = Schemas["UserOut"];
export type Me = Schemas["MeOut"];
export type EntitlementSummary = Schemas["EntitlementSummary"];
export type EntitlementOut = Schemas["EntitlementOut"];
export type TokenResponse = Schemas["TokenResponse"];
export type MessageResponse = Schemas["MessageResponse"];
export type LoginRequest = Schemas["LoginRequest"];
export type RegisterRequest = Schemas["RegisterRequest"];
export type OtpRequest = Schemas["OtpRequest"];
export type OtpVerify = Schemas["OtpVerify"];
export type GoogleSignIn = Schemas["GoogleSignIn"];

export type AdminUserList = Schemas["AdminUserList"];
export type AdminUserCreate = Schemas["AdminUserCreate"];
export type AdminUserUpdate = Schemas["AdminUserUpdate"];
export type EntitlementUpdate = Schemas["EntitlementUpdate"];

// ---- P2: models, keys, usage, job sources ----
export type ModelCatalog = Schemas["ModelCatalogOut"];
export type UserModel = Schemas["UserModelOut"];
export type KeyOut = Schemas["KeyOut"];
export type KeyList = Schemas["KeyList"];
export type UsageSummary = Schemas["UsageSummary"];
export type ProviderSettings = Schemas["ProviderSettingsOut"];
export type ProviderSettingsIn = Schemas["ProviderSettingsIn"];
export type UserSource = Schemas["UserSourceOut"];
export type AdminModel = Schemas["AdminModelOut"];
export type AdminModelCreate = Schemas["AdminModelCreate"];
export type AdminModelUpdate = Schemas["AdminModelUpdate"];
export type ModelTestResult = Schemas["ModelTestResult"];
export type TaskDefaults = Schemas["TaskDefaults"];
export type PlatformKeyList = Schemas["PlatformKeyList"];
export type AdminSource = Schemas["AdminSourceOut"];
export type AdminSourceUpdate = Schemas["AdminSourceUpdate"];

export type TaskResponse = Schemas["TaskResponse"];
export type TaskStatus = Schemas["TaskStatus"];
export type ApplyRequest = Schemas["ApplyRequest"];
export type PipelineRequest = Schemas["PipelineRequest"];
export type SearchRequest = Schemas["SearchRequest"];
export type ScoreRequest = Schemas["ScoreRequest"];
export type CompanyAtsRequest = Schemas["CompanyAtsRequest"];
export type ApplicationLogEntry = Schemas["ApplicationLogEntry"];
export type ApplicationLogResult = Schemas["ApplicationLogResult"];

/*
 * The streaming pipeline routes have no response_model on the backend, so
 * OpenAPI types them as `unknown`. Hand-written from app/routes/pipeline.py and
 * app/services/pipeline_progress.py (record_scored_job, create_run).
 */
export interface StreamedJob {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  posted: string;
  keyword_score: number | null;
  llm_score: number | null;
  llm_reason: string;
  auto_apply_capable: boolean;
  created_at: string;
}

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export interface PipelineRunStarted {
  run_id: string;
  /** Sources left out of this run and why (admin/user switch, Free tools only, missing key). */
  skipped_sources?: string[];
}

export interface PipelineRunMeta {
  user_id: string;
  status: RunStatus;
  total_keywords: number;
  keywords_completed: number;
  error: string;
  created_at: string;
}

export interface PipelineRunJobsPage {
  run_status: RunStatus;
  jobs: StreamedJob[];
}
