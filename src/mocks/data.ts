/**
 * In-memory mock backend state. Shapes follow the backend OpenAPI snapshot
 * (openapi/backend-openapi.json) and PROJECT.md. Reset between tests with resetMockDb().
 */
import type { ApplicationLogEntry, EntitlementSummary, StreamedJob, User } from "../lib/api/types";

export const MOCK_OTP_CODE = "123456";
export const MOCK_PASSWORD = "password123";

/** Signs in normally, then every authenticated call answers 403 account_disabled. */
export const DISABLED_EMAIL = "disabled@jobfinder.test";

export const FEATURES = [
  "job_search",
  "scoring",
  "ats_discovery",
  "auto_apply",
  "gmail_tracking",
  "voice_prep",
  "live_copilot",
  "resume_tailoring",
  "premium_models",
] as const;

function defaultEntitlements(): Record<string, EntitlementSummary> {
  const ent: Record<string, EntitlementSummary> = {};
  for (const f of FEATURES) {
    ent[f] = { enabled: true, max_level: null, quota_per_day: null, quota_remaining: null };
  }
  ent.auto_apply = { enabled: true, max_level: 2, quota_per_day: 20, quota_remaining: 17 };
  ent.live_copilot = {
    enabled: false,
    max_level: null,
    quota_per_day: null,
    quota_remaining: null,
  };
  ent.premium_models = {
    enabled: false,
    max_level: null,
    quota_per_day: null,
    quota_remaining: null,
  };
  return ent;
}

const SAMPLE_JOBS: Omit<StreamedJob, "id" | "created_at">[] = [
  [
    "LinkedIn",
    "Senior Python Engineer",
    "Northwind Labs",
    "Bengaluru, India",
    91,
    "Strong FastAPI and AWS overlap; asks for 4+ years, you have 3.",
    true,
  ],
  [
    "Indeed",
    "AI Engineer (LLM apps)",
    "Lumen Analytics",
    "Remote, India",
    88,
    "LangChain and RAG work match the core of the role.",
    false,
  ],
  [
    "LinkedIn",
    "Backend Developer, Platform",
    "Kestrel Pay",
    "Pune, India",
    84,
    "Django + Postgres stack matches; payments domain is new to you.",
    true,
  ],
  [
    "Naukri",
    "LLM Application Developer",
    "Brightline Health",
    "Mumbai, India",
    79,
    "Good fit on Python and prompt tooling; missing healthcare data experience.",
    false,
  ],
  [
    "Indeed",
    "Software Engineer II, Data",
    "Orchard Retail",
    "Bengaluru, India",
    72,
    "Python and SQL match; role leans on Spark, which isn't in your profile.",
    false,
  ],
  [
    "LinkedIn",
    "Full-stack Engineer (React/FastAPI)",
    "Tessellate",
    "Remote",
    70,
    "React + FastAPI is an exact stack match; seniority is lower than your target.",
    true,
  ],
].map(([source, title, company, location, score, reason, capable]) => ({
  source: source as string,
  title: title as string,
  company: company as string,
  location: location as string,
  url: `https://jobs.example.com/${encodeURIComponent(String(company).toLowerCase())}/${encodeURIComponent(String(title).toLowerCase())}`,
  description: "",
  posted: "2026-10-14",
  keyword_score: Math.round((score as number) * 0.8),
  llm_score: score as number,
  llm_reason: reason as string,
  auto_apply_capable: capable as boolean,
}));

export interface MockRun {
  id: string;
  createdAt: number;
  jobs: StreamedJob[];
  /** How many jobs each poll releases, to imitate streaming. */
  delivered: number;
  status: "running" | "completed" | "cancelled";
}

export interface MockTask {
  id: string;
  polls: number;
  status: "pending" | "running" | "completed" | "failed";
  progress: string;
  createdAt: string;
}

function makeApplications(): ApplicationLogEntry[] {
  const rows: [string, string, string, string][] = [
    [
      "Senior Python Engineer",
      "Northwind Labs",
      "LinkedIn",
      "easy_apply_form_filled_awaiting_review",
    ],
    ["AI Engineer (LLM apps)", "Lumen Analytics", "Indeed", "submitted"],
    ["Backend Developer", "Harbor Freight Tech", "LinkedIn", "interview"],
    ["Data Engineer", "Orchard Retail", "Indeed", "rejected"],
    ["Platform Engineer", "Kestrel Pay", "LinkedIn", "open_failed:TimeoutError page did not load"],
    ["Python Developer", "Quarry Systems", "Naukri", "opened"],
  ];
  return rows.map(([title, company, source, status], i) => ({
    id: `app_${i + 1}`,
    date: `2026-10-${String(14 - i).padStart(2, "0")}`,
    title,
    company,
    source,
    url: `https://jobs.example.com/${i + 1}`,
    status,
    status_source: i === 1 ? "manual" : "browser_apply",
    updated_at: new Date(Date.UTC(2026, 9, 14 - i)).toISOString(),
  }));
}

function makeUsers(): User[] {
  const base = {
    is_active: true,
    manager_id: null,
    email_verified_at: "2026-10-01T09:00:00Z",
    last_login_at: "2026-10-14T08:30:00Z",
  };
  return [
    {
      ...base,
      id: "u_admin",
      email: "admin@jobfinder.test",
      name: "Asha Admin",
      role: "admin",
      auth_provider: "otp",
    },
    {
      ...base,
      id: "u_demo",
      email: "demo@jobfinder.test",
      name: "Dev Demo",
      role: "user",
      auth_provider: "password",
    },
    {
      ...base,
      id: "u_disabled",
      email: DISABLED_EMAIL,
      name: "Dana Disabled",
      role: "user",
      auth_provider: "otp",
    },
  ];
}

export const mockDb = {
  users: makeUsers(),
  entitlements: {} as Record<string, Record<string, EntitlementSummary>>,
  /** access token -> user id */
  tokens: new Map<string, string>(),
  otpCooldownUntil: new Map<string, number>(),
  otpAttempts: new Map<string, number>(),
  runs: new Map<string, MockRun>(),
  tasks: new Map<string, MockTask>(),
  applications: makeApplications(),
  sampleJobs: SAMPLE_JOBS,
};

export function entitlementsFor(userId: string): Record<string, EntitlementSummary> {
  mockDb.entitlements[userId] ??= defaultEntitlements();
  return mockDb.entitlements[userId];
}

export function resetMockDb(): void {
  mockDb.users = makeUsers();
  mockDb.entitlements = {};
  mockDb.tokens.clear();
  mockDb.otpCooldownUntil.clear();
  mockDb.otpAttempts.clear();
  mockDb.runs.clear();
  mockDb.tasks.clear();
  mockDb.applications = makeApplications();
}
