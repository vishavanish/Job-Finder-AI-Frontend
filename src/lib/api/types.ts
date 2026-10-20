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
export type ApplicantInfo = Schemas["ApplicantInfo"];

// ---- P3 / P3.2: profile, resumes, search profiles, jobs, alerts ----
export type ProfileIn = Schemas["ProfileIn"];
export type ProfileOut = Schemas["ProfileOut"];
/** Applicant info being edited (every field optional); profileApi.fullApplicant fills defaults for PUT /profile. */
export type ApplicantInfoIn = Partial<Schemas["ApplicantInfoIn"]>;
export type EeoAnswers = Schemas["EeoAnswers"];
export type PreferencesIn = Schemas["PreferencesIn"];
export type PreferencesOut = Schemas["PreferencesOut"];
export type ResumeOut = Schemas["ResumeOut"];
export type ResumeDetail = Schemas["ResumeDetail"];
export type ResumeList = Schemas["ResumeList"];
export type ParsedResume = Schemas["ParsedResume"];
export type ExperienceItem = Schemas["ExperienceItem"];
export type SearchProfileIn = Schemas["SearchProfileIn"];
export type SearchProfileOut = Schemas["SearchProfileOut"];
export type SearchProfileList = Schemas["SearchProfileList"];
export type SkillIn = Schemas["SkillIn"];
export type TitleSuggestions = Schemas["TitleSuggestions"];
export type UserJob = Schemas["UserJobOut"];
export type UserJobList = Schemas["UserJobList"];
export type ScoreThresholds = Schemas["ScoreThresholds"];
export type AlertIn = Schemas["AlertIn"];
export type AlertOut = Schemas["AlertOut"];
export type AlertList = Schemas["AlertList"];
export type AlertRunOut = Schemas["AlertRunOut"];
export type AlertRunList = Schemas["AlertRunList"];
export type AlertRunJobs = Schemas["AlertRunJobs"];

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
  /** P3.2: skills matched/missing, title fit, seniority, missing required skills. */
  match?: MatchBreakdown | null;
  posted_at?: string | null;
  posted_hours_ago?: number | null;
  early?: boolean;
  new_since_last_search?: boolean | null;
  /** LinkedIn applicant count as shown ("143", "Over 200"). */
  applicants?: string | null;
  /** A better copy (or an update) of a job already in the feed: replace the entry with this id. */
  replaces?: boolean;
  /** P4a: the company's own apply page behind a board posting, when known. */
  apply_url?: string | null;
  /** P4a: which apply buttons work for this job, and why not (from the backend). */
  apply_options?: ApplyOptions | null;
}

export interface MatchBreakdown {
  skills_matched: string[];
  skills_missing: string[];
  skills_total: number;
  title_fit: number | null;
  seniority?: "match" | "stretch" | "overqualified" | null;
  missing_required?: string[] | null;
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
  next_offset?: number;
}

// ---- P4a / P4b: Apply Center ----
export type ApplyOptions = Schemas["ApplyOptions"];
export type ApplyOption = Schemas["ApplyOption"];
export type PrepPack = Schemas["PrepPackOut"];
export type PrepIn = Schemas["PrepIn"];
export type ApplyRun = Schemas["RunOut"];
export type ApplyRunList = Schemas["RunList"];
export type ApplyRunField = Schemas["RunField"];
export type ApplyRunState = ApplyRun["state"];
export type ApplySettings = Schemas["ApplySettingsOut"];
export type ApplySettingsIn = Schemas["ApplySettingsIn"];
export type ApplyProof = Schemas["ProofOut"];
export type SavedAnswer = Schemas["AnswerOut"];
export type SavedAnswerIn = Schemas["AnswerIn"];
export type SavedAnswerList = Schemas["AnswerList"];

// ---- P5: tracker and Gmail ----
type RawTrackerStats = Schemas["TrackerStats"];
/** OpenAPI types the count maps as `unknown`; the backend sends integers. */
export type TrackerStats = Omit<RawTrackerStats, "funnel" | "by_status" | "by_source"> & {
  funnel: Record<string, number>;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
};
export type ApplicationTimeline = Schemas["ApplicationTimeline"];
export type TimelineEvent = Schemas["TimelineEvent"];
export type TimelineEmail = Schemas["TimelineEmail"];
export type ApplicationStatus = Schemas["ApplicationStatusUpdate"]["status"];
export type GmailAccountList = Schemas["GmailAccountList"];
export type GmailAccount = Schemas["GmailAccountOut"];
export type GmailConnect = Schemas["GmailConnectOut"];
export type EmailEvent = Schemas["EmailEventOut"];
export type EmailEventList = Schemas["EmailEventList"];
export type EmailSuggestion = Schemas["Suggestion"];
export type ResolveIn = Schemas["ResolveIn"];
export type ResolveCategory = NonNullable<ResolveIn["category"]>;

// ---- P6: ATS Discovery ----
export type AtsSearchResult = Schemas["AtsSearchResult"];
export type AtsCompanyGroup = Schemas["AtsCompanyGroup"];
export type AtsJob = Schemas["AtsJobOut"];
export type AtsJobDetail = Schemas["AtsJobDetail"];
export type AtsCompany = Schemas["AtsCompanyOut"];
export type AtsCompanyIn = Schemas["AtsCompanyIn"];
export type AtsCompanyJobs = Schemas["AtsCompanyJobs"];
export type AtsRegistryStats = Schemas["AtsRegistryStats"];
export type AtsHealth = Schemas["AtsHealth"];
export type AtsPlatform = Schemas["AtsPlatformOut"];
export type AtsTracked = Schemas["AtsTracked"];

// ---- P7: voice interview prep (Practice + Live Copilot) and the story bank ----
export type VoiceProviders = Schemas["VoiceProvidersOut"];
export type SpeechModel = Schemas["SpeechModelOut"];
export type VoiceSettings = Schemas["VoiceSettingsOut"];
export type VoiceSettingsIn = Schemas["VoiceSettingsIn"];
export type CopilotAckIn = Schemas["CopilotAckIn"];
export type VoiceSessionCreate = Schemas["SessionCreateIn"];
export type VoiceSessionCreated = Schemas["SessionCreateOut"];
export type VoiceSession = Schemas["VoiceSessionOut"];
export type VoiceSessionDetail = Schemas["VoiceSessionDetail"];
export type VoiceTurn = Schemas["VoiceTurnOut"];
export type VoiceStreamToken = Schemas["StreamTokenOut"];
export type VoiceFeedback = Schemas["VoiceFeedbackOut"];
export type AnswerFeedback = Schemas["AnswerFeedbackOut"];
export type VoiceHistory = Schemas["VoiceHistoryOut"];
export type VoiceProgress = Schemas["VoiceProgressOut"];
export type ProgressArea = Schemas["ProgressArea"];
export type VoiceHealth = Schemas["VoiceHealthOut"];
export type InterviewType = VoiceSessionCreate["interview_type"];
export type Story = Schemas["StoryOut"];
export type StoryIn = Schemas["StoryIn"];
export type StoryList = Schemas["StoryList"];
export type TaskQueued = Schemas["TaskQueuedOut"];
