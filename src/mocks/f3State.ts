/**
 * In-memory state for the F3 mocks (backend P3–P3.2 + F3 endpoints): profile,
 * preferences, resumes, search profiles, canonical jobs and per-user job
 * state, alerts. Kept apart from the handlers so mocks/handlers.ts (pipeline)
 * can use it without importing mocks/f3.ts. Reset between tests.
 */
import type {
  AlertOut,
  AlertRunOut,
  EeoAnswers,
  ParsedResume,
  PreferencesOut,
  ProfileOut,
  ResumeOut,
  SearchProfileOut,
  StreamedJob,
} from "../lib/api/types";

export interface MockResume extends ResumeOut {
  parsed: ParsedResume | null;
  text: string;
  /** Polls left before a "pending" parse finishes. */
  pendingPolls: number;
}

export interface MockUserJob {
  state: "seen" | "saved" | "hidden" | "applied";
  updated_at: string;
}

const NOW = "2026-10-16T09:00:00Z";
const PREFER_NOT = "prefer_not_to_say";

export const EMPTY_EEO: EeoAnswers = {
  gender: PREFER_NOT,
  ethnicity: PREFER_NOT,
  veteran_status: PREFER_NOT,
  disability_status: PREFER_NOT,
  pronouns: PREFER_NOT,
};

export const SAMPLE_PARSED: ParsedResume = {
  name: "Dev Demo",
  email: "demo@jobfinder.test",
  phone: "+91 90000 00000",
  location: "Pune, India",
  headline: "Backend and AI engineer",
  summary: "Python engineer with 3 years building FastAPI services and LLM features.",
  total_experience_years: 3,
  experience: [
    {
      title: "Software Engineer",
      company: "Acme Labs",
      location: "Pune",
      start: "2023-06",
      end: "",
      current: true,
      highlights: [],
    },
  ],
  education: [],
  skills: ["Python", "FastAPI", "Django", "AWS", "LangChain"],
  certifications: [],
  languages: [],
  links: [],
};

function seedResumes(): Record<string, MockResume[]> {
  return {
    u_demo: [
      {
        id: "r_demo_1",
        version: 1,
        is_master: true,
        parent_id: null,
        label: "Main",
        file_name: "dev-demo.pdf",
        content_type: "application/pdf",
        size_bytes: 182_000,
        parse_status: "reviewed",
        parse_error: null,
        parsed_by: "mock",
        created_at: NOW,
        updated_at: NOW,
        parsed: SAMPLE_PARSED,
        text: "Dev Demo — Python engineer",
        pendingPolls: 0,
      },
    ],
  };
}

function seedSearchProfiles(): Record<string, SearchProfileOut[]> {
  return {
    u_demo: [
      {
        id: "sp_demo_1",
        name: "Backend and AI",
        is_default: true,
        titles: ["Senior Python Engineer", "AI Engineer"],
        skills: [
          { name: "Python", weight: "core", synonyms: ["py"], years: 3 },
          { name: "FastAPI", weight: "strong", synonyms: [], years: 2 },
          { name: "Kubernetes", weight: "familiar", synonyms: ["k8s"], years: null },
        ],
        must_have: [],
        nice_to_have: ["LangChain"],
        exclude: [],
        created_at: NOW,
        updated_at: NOW,
      },
    ],
  };
}

export const f3Db = {
  profiles: {} as Record<string, ProfileOut>,
  eeo: {} as Record<string, EeoAnswers>,
  prefs: {} as Record<string, PreferencesOut>,
  resumes: seedResumes(),
  searchProfiles: seedSearchProfiles(),
  jobs: new Map<string, StreamedJob>(),
  userJobs: {} as Record<string, Record<string, MockUserJob>>,
  alerts: {} as Record<string, AlertOut[]>,
  alertRuns: {} as Record<string, AlertRunOut[]>,
};

export function resetF3Mock(): void {
  f3Db.profiles = {};
  f3Db.eeo = {};
  f3Db.prefs = {};
  f3Db.resumes = seedResumes();
  f3Db.searchProfiles = seedSearchProfiles();
  f3Db.jobs.clear();
  f3Db.userJobs = {};
  f3Db.alerts = {};
  f3Db.alertRuns = {};
}

export function userJobs(userId: string): Record<string, MockUserJob> {
  f3Db.userJobs[userId] ??= {};
  return f3Db.userJobs[userId];
}

export function setUserJob(userId: string, jobId: string, state: MockUserJob["state"]): void {
  userJobs(userId)[jobId] = { state, updated_at: new Date().toISOString() };
}

/** What the backend's match breakdown + freshness would add to a scored job. */
export function enrich(job: Omit<StreamedJob, "id" | "created_at">, i: number): StreamedJob {
  const hours = [2, 9, 30, 52, 80, 120][i % 6] ?? 48;
  return {
    ...job,
    id: `job_${i + 1}`,
    created_at: new Date().toISOString(),
    match: {
      skills_matched: ["Python", "FastAPI"].slice(0, i % 2 ? 1 : 2),
      skills_missing: i % 2 ? ["FastAPI", "Kubernetes"] : ["Kubernetes"],
      skills_total: 3,
      title_fit: [100, 67, 50, 100, 33, 67][i % 6] ?? 50,
      seniority: i === 0 ? "stretch" : "match",
      missing_required: i === 0 ? ["Go"] : [],
    },
    posted_at: new Date(Date.now() - hours * 3600_000).toISOString(),
    posted_hours_ago: hours,
    early: hours < 24,
    new_since_last_search: i < 3,
    applicants: job.source === "LinkedIn" ? "143" : null,
  };
}
