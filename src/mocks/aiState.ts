/**
 * State and access rules shared by the P2 mock handlers (mocks/ai.ts) and the
 * pipeline mock (mocks/handlers.ts). Kept separate so the two handler modules
 * don't import each other.
 */
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
  last_success_at: string | null;
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

function seedSources(): MockSource[] {
  const base = {
    rate_limit: null,
    enabled_global: true,
    last_success_at: NOW,
    requires_key: false,
    key_scope: null,
  };
  return [
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
      tos_risk: "high",
      description: "Manual import, or JobSpy when automatic Naukri search is on.",
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

export function sourceAvailability(
  user: User,
  s: MockSource,
): { ok: boolean; reason: string | null } {
  if (!s.enabled_global) return { ok: false, reason: "turned off by the admin" };
  if ((aiDb.sourceChoices[user.id] ?? {})[s.key] === false) {
    return { ok: false, reason: "turned off in your Providers settings" };
  }
  if (aiDb.freeOnly[user.id] && (s.tier === "paid" || s.tier === "byok")) {
    return { ok: false, reason: 'paid source — "Free tools only" is on' };
  }
  if (
    s.requires_key &&
    s.key_scope &&
    !userScopes(user.id).has(s.key_scope) &&
    !platformKey(s.key_scope)
  ) {
    return { ok: false, reason: `needs a ${s.key_scope} API key` };
  }
  return { ok: true, reason: null };
}

export const health = (s: MockSource) => ({
  consecutive_failures: 0,
  last_success_at: s.last_success_at,
  last_error_at: null,
  last_error: null,
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
