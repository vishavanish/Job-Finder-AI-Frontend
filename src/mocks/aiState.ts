/**
 * State and access rules shared by the P2 mock handlers (mocks/ai.ts) and the
 * pipeline mock (mocks/handlers.ts). Kept separate so the two handler modules
 * don't import each other.
 */
import { f5Db } from "./f5State";
import { entitlementsFor } from "./data";
import type { User } from "../lib/api/types";

export const TASKS = [
  "score",
  "resume_parse",
  "resume_tailor",
  "cover_letter",
  "form_answer",
  "email_classify",
  "interview_chat",
  "interview_eval",
];

export const KEY_REQUIRED = new Set(["gemini", "groq", "huggingface", "anthropic"]);
export const ENV_SCOPES = new Set(["gemini", "groq", "huggingface", "anthropic", "apify"]);

export interface MockModel {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  tier: "free" | "paid";
  tasks: string[];
  base_url: string | null;
  key_scope: string;
  cost_per_1k_in: number;
  cost_per_1k_out: number;
  context_window: number | null;
  max_output_tokens: number | null;
  enabled_global: boolean;
  priority: number;
  notes: string | null;
  failures: number;
  paused: boolean;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockKey {
  id: string;
  owner_type: "platform" | "user";
  user_id: string | null;
  scope: string;
  label: string | null;
  last4: string;
  created_at: string;
}

export interface MockSource {
  key: string;
  name: string;
  tier: string;
  tos_risk: string;
  requires_key: boolean;
  key_scope: string | null;
  description: string | null;
  rate_limit: string | null;
  enabled_global: boolean;
  /** On for users who never switched it themselves (backend P3.1). */
  default_enabled: boolean;
  last_success_at: string | null;
  /** Paused after repeated errors until this time (backend P3.1 breaker). */
  paused_until?: string | null;
}

export const NOW = "2026-10-15T09:00:00Z";

export function model(
  p: Partial<MockModel> & Pick<MockModel, "id" | "provider" | "model_id" | "display_name">,
): MockModel {
  return {
    tier: "free",
    tasks: [],
    base_url: null,
    key_scope: p.provider,
    cost_per_1k_in: 0,
    cost_per_1k_out: 0,
    context_window: null,
    max_output_tokens: null,
    enabled_global: true,
    priority: 100,
    notes: null,
    failures: 0,
    paused: false,
    last_success_at: NOW,
    last_error: null,
    created_at: NOW,
    updated_at: NOW,
    ...p,
  };
}

function seedModels(): MockModel[] {
  return [
    model({
      id: "m_gemini",
      provider: "gemini",
      model_id: "gemini-2.5-flash",
      display_name: "Gemini 2.5 Flash",
      priority: 10,
    }),
    model({
      id: "m_groq",
      provider: "groq",
      model_id: "openai/gpt-oss-120b",
      display_name: "GPT-OSS 120B (Groq)",
      priority: 20,
    }),
    model({
      id: "m_hf",
      provider: "huggingface",
      model_id: "Qwen/Qwen3-8B",
      display_name: "Qwen3 8B (Hugging Face)",
      priority: 30,
      failures: 3,
      paused: true,
      last_error: "HTTP 402 Payment Required",
    }),
    model({
      id: "m_claude",
      provider: "anthropic",
      model_id: "claude-opus-5-5",
      display_name: "Claude Opus 5.5",
      tier: "paid",
      priority: 40,
      cost_per_1k_in: 0.004,
      cost_per_1k_out: 0.02,
    }),
  ];
}

/** Mirrors backend migrations 0004/0006/0007 (app/providers/job_sources/registry.py). */
function seedSources(): MockSource[] {
  const base = {
    rate_limit: null,
    enabled_global: true,
    default_enabled: true,
    last_success_at: NOW,
    requires_key: false,
    key_scope: null,
  };
  const feed = (key: string, name: string, description: string, on = true): MockSource => ({
    ...base,
    key,
    name,
    tier: "free",
    tos_risk: "low",
    default_enabled: on,
    description,
    rate_limit: "one download per hour (cached)",
  });
  const keyed = (
    key: string,
    name: string,
    scope: string,
    description: string,
    on = true,
  ): MockSource => ({
    ...base,
    key,
    name,
    tier: "free_key",
    tos_risk: "none",
    requires_key: true,
    key_scope: scope,
    default_enabled: on,
    description,
    last_success_at: null,
    rate_limit: "daily cap per user",
  });
  return [
    {
      ...base,
      key: "glassdoor",
      name: "Glassdoor",
      tier: "free",
      tos_risk: "high",
      default_enabled: false,
      description: "Public job search via JobSpy (scraping). Off by default.",
    },
    {
      ...base,
      key: "google_jobs",
      name: "Google Jobs",
      tier: "free",
      tos_risk: "high",
      default_enabled: false,
      description:
        "Google's job listings via JobSpy (scraping); often returns nothing. Off by default.",
    },
    keyed(
      "adzuna",
      "Adzuna",
      "adzuna",
      "Official API, covers India. Save the key as APP_ID:APP_KEY.",
    ),
    keyed("jooble", "Jooble", "jooble", "Official API, covers India."),
    keyed("careerjet", "Careerjet", "careerjet", "Official API (en_IN for India)."),
    keyed(
      "google_jobs_api",
      "Google Jobs (your key)",
      "brightdata,serpapi,jsearch",
      "Google Jobs through YOUR OWN free key: Bright Data, SerpApi or JSearch. Off by default.",
      false,
    ),
    feed("remoteok", "RemoteOK", "Remote jobs feed. Runs when you search for remote work."),
    feed("remotive", "Remotive", "Remote jobs feed. Runs when you search for remote work."),
    feed("himalayas", "Himalayas", "Remote jobs feed. Runs when you search for remote work."),
    feed("jobicy", "Jobicy", "Remote jobs feed. Runs when you search for remote work."),
    feed("wwr", "We Work Remotely", "Remote jobs RSS feed. Runs when you search for remote work."),
    feed("hn_hiring", "HN Who is hiring", "Monthly Hacker News 'Who is hiring?' thread."),
    feed(
      "arbeitnow",
      "Arbeitnow",
      "Remote jobs feed, mostly Germany/EU roles. Off by default.",
      false,
    ),
    {
      ...feed(
        "themuse",
        "The Muse",
        "Remote/flexible jobs feed, mostly US roles. Off by default.",
        false,
      ),
      paused_until: null,
    },
    {
      ...base,
      key: "indeed",
      name: "Indeed",
      tier: "free",
      tos_risk: "high",
      description: "Public job search via JobSpy (scraping).",
    },
    {
      ...base,
      key: "linkedin",
      name: "LinkedIn",
      tier: "free",
      tos_risk: "high",
      description: "Public job search via JobSpy (scraping). Paced with retries.",
    },
    {
      ...base,
      key: "naukri",
      name: "Naukri",
      tier: "free",
      tos_risk: "none",
      description: "Jobs you paste in. Naukri blocks automated search (captcha).",
    },
    {
      ...base,
      key: "naukri_apify",
      name: "Naukri via Apify",
      tier: "paid",
      tos_risk: "low",
      requires_key: true,
      key_scope: "apify",
      description: "Apify actor; uses Apify credits.",
      last_success_at: null,
    },
    {
      ...base,
      key: "email_alerts",
      name: "Job alert emails",
      tier: "free",
      tos_risk: "none",
      description:
        "Jobs from the alert emails Naukri, LinkedIn, Indeed and others send you (experimental).",
    },
  ];
}

function seedKeys(): MockKey[] {
  // The platform has Gemini, Groq and Anthropic keys; Hugging Face only via .env.
  return ["gemini", "groq", "anthropic"].map((scope) => ({
    id: `k_platform_${scope}`,
    owner_type: "platform",
    user_id: null,
    scope,
    label: null,
    last4: "9f2c",
    created_at: NOW,
  }));
}

export const aiDb = {
  models: seedModels(),
  defaults: {} as Record<string, string>,
  prefs: {} as Record<string, Record<string, string>>,
  keys: seedKeys(),
  sources: seedSources(),
  sourceChoices: {} as Record<string, Record<string, boolean>>,
  freeOnly: {} as Record<string, boolean>,
};

export function resetAiMock(): void {
  aiDb.models = seedModels();
  aiDb.defaults = {};
  aiDb.prefs = {};
  aiDb.keys = seedKeys();
  aiDb.sources = seedSources();
  aiDb.sourceChoices = {};
  aiDb.freeOnly = {};
}

// ---------------------------------------------------------------- helpers

export function masked(k: MockKey) {
  return {
    id: k.id,
    scope: k.scope,
    owner_type: k.owner_type,
    label: k.label,
    last4: k.last4,
    masked: `••••${k.last4}`,
    created_at: k.created_at,
    last_used_at: null,
  };
}

export const userScopes = (userId: string) =>
  new Set(
    aiDb.keys.filter((k) => k.owner_type === "user" && k.user_id === userId).map((k) => k.scope),
  );

export const platformKey = (scope: string) =>
  aiDb.keys.some((k) => k.owner_type === "platform" && k.scope === scope) || ENV_SCOPES.has(scope);

export function access(user: User, m: MockModel): { allowed: boolean; reason: string | null } {
  if (!m.enabled_global) return { allowed: false, reason: "Turned off by the admin." };
  const own = userScopes(user.id).has(m.key_scope);
  if (m.tier === "paid") {
    if (aiDb.freeOnly[user.id])
      return { allowed: false, reason: 'Paid model — "Free tools only" is on.' };
    if (!own && !entitlementsFor(user.id).premium_models?.enabled) {
      return {
        allowed: false,
        reason: `Paid model — needs the premium AI models feature or your own ${m.key_scope} key.`,
      };
    }
  }
  if (KEY_REQUIRED.has(m.provider) && !own && !platformKey(m.key_scope)) {
    return { allowed: false, reason: `No ${m.key_scope} API key is set up yet.` };
  }
  return { allowed: true, reason: null };
}

function hasActiveGmail(userId: string): boolean {
  return f5Db.accounts.some((a) => a.user_id === userId && a.status === "active");
}

export function sourceAvailability(
  user: User,
  s: MockSource,
): { ok: boolean; reason: string | null } {
  if (!s.enabled_global) return { ok: false, reason: "turned off by the admin" };
  if (!((aiDb.sourceChoices[user.id] ?? {})[s.key] ?? s.default_enabled)) {
    return { ok: false, reason: "turned off in your Providers settings" };
  }
  if (s.key === "email_alerts" && !hasActiveGmail(user.id)) {
    return { ok: false, reason: "connect Gmail to read your job-alert emails" };
  }
  if (aiDb.freeOnly[user.id] && (s.tier === "paid" || s.tier === "byok")) {
    return { ok: false, reason: 'paid source — "Free tools only" is on' };
  }
  if (s.requires_key && s.key_scope) {
    const scopes = s.key_scope.split(",");
    if (!scopes.some((sc) => userScopes(user.id).has(sc) || platformKey(sc))) {
      return { ok: false, reason: `needs a ${scopes.join(" or ")} API key` };
    }
  }
  if (s.paused_until && new Date(s.paused_until) > new Date()) {
    return {
      ok: false,
      reason: `paused after repeated errors — retrying after ${s.paused_until.slice(11, 16)} UTC`,
    };
  }
  return { ok: true, reason: null };
}

export const health = (s: MockSource) => ({
  consecutive_failures: 0,
  last_success_at: s.last_success_at,
  last_error_at: null,
  last_error: null,
  paused_until: s.paused_until ?? null,
});

/** Which of the requested sources would run, and why the rest are skipped (search payloads). */
export function planSources(user: User, requested: string[], wantApify: boolean) {
  const sources: string[] = [];
  const skipped: string[] = [];
  for (const key of requested) {
    const s = aiDb.sources.find((x) => x.key === key);
    if (!s) continue;
    const a = sourceAvailability(user, s);
    if (a.ok) sources.push(key);
    else skipped.push(`${s.name}: ${a.reason}`);
  }
  let apify = false;
  if (wantApify) {
    const s = aiDb.sources.find((x) => x.key === "naukri_apify")!;
    const a = sourceAvailability(user, s);
    if (a.ok) apify = true;
    else skipped.push(`${s.name}: ${a.reason}`);
  }
  return { sources, apify, skipped };
}
