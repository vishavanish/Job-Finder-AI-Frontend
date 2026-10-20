/**
 * MSW handlers for backend P2 (routes/models.py, providers.py, admin_ai.py):
 * model registry, own keys, platform keys, usage and job sources. Same access
 * rules as app/services/ai_router.access, simplified. Key values are kept only
 * to compute last4 and are never returned.
 */
import { http, HttpResponse } from "msw";
import { API, authenticate, newId, readJson, requireRole } from "./handlers";
import { entitlementsFor, mockDb } from "./data";
import {
  ENV_SCOPES,
  NOW,
  TASKS,
  access,
  aiDb,
  health,
  masked,
  model,
  platformKey,
  sourceAvailability,
  userScopes,
  type MockKey,
  type MockModel,
  type MockSource,
} from "./aiState";
import type { User } from "../lib/api/types";

function catalog(user: User) {
  const enabled = aiDb.models
    .filter((m) => m.enabled_global)
    .sort((a, b) => a.priority - b.priority);
  const scopes = userScopes(user.id);
  const ids = new Set(enabled.map((m) => m.id));
  const keep = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => ids.has(v)));
  return {
    tasks: TASKS,
    models: enabled.map((m) => {
      const a = access(user, m);
      return {
        id: m.id,
        display_name: m.display_name,
        provider: m.provider,
        model_id: m.model_id,
        tier: m.tier,
        tasks: m.tasks,
        key_scope: m.key_scope,
        available: a.allowed,
        reason: a.reason,
        uses_own_key: scopes.has(m.key_scope),
        paused: m.paused,
      };
    }),
    preferences: keep(aiDb.prefs[user.id] ?? {}),
    defaults: keep(aiDb.defaults),
    free_only: Boolean(aiDb.freeOnly[user.id]),
    premium_models: Boolean(entitlementsFor(user.id).premium_models?.enabled),
  };
}

function adminModel(m: MockModel) {
  return {
    id: m.id,
    provider: m.provider,
    model_id: m.model_id,
    display_name: m.display_name,
    tier: m.tier,
    tasks: m.tasks,
    base_url: m.base_url,
    key_scope: m.key_scope,
    key_configured: platformKey(m.key_scope),
    cost_per_1k_in: m.cost_per_1k_in,
    cost_per_1k_out: m.cost_per_1k_out,
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
    enabled_global: m.enabled_global,
    priority: m.priority,
    notes: m.notes,
    health: {
      consecutive_failures: m.failures,
      last_success_at: m.last_success_at,
      last_error_at: m.last_error ? NOW : null,
      last_error: m.last_error,
      paused: m.paused,
    },
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

function providerView(user: User) {
  return {
    free_only: Boolean(aiDb.freeOnly[user.id]),
    sources: aiDb.sources.map((s) => {
      const a = sourceAvailability(user, s);
      return {
        key: s.key,
        name: s.name,
        tier: s.tier,
        tos_risk: s.tos_risk,
        requires_key: s.requires_key,
        key_scope: s.key_scope,
        description: s.description,
        rate_limit: s.rate_limit,
        enabled: (aiDb.sourceChoices[user.id] ?? {})[s.key] ?? s.default_enabled,
        default_enabled: s.default_enabled,
        available: a.ok,
        reason: a.reason,
        health: health(s),
      };
    }),
  };
}

function usage(userId?: string) {
  const byModel = [
    {
      model_ref: "m_groq",
      provider: "groq",
      model_id: "openai/gpt-oss-120b",
      calls: 42,
      failed_calls: 1,
      tokens_in: 51200,
      tokens_out: 6100,
      cost_usd: 0,
    },
    {
      model_ref: "m_gemini",
      provider: "gemini",
      model_id: "gemini-2.5-flash",
      calls: 8,
      failed_calls: 8,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
    },
  ];
  const totals = byModel.reduce(
    (t, r) => ({
      calls: t.calls + r.calls,
      failed_calls: t.failed_calls + r.failed_calls,
      tokens_in: t.tokens_in + r.tokens_in,
      tokens_out: t.tokens_out + r.tokens_out,
      cost_usd: t.cost_usd + r.cost_usd,
    }),
    { calls: 0, failed_calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 },
  );
  return {
    since: "2026-09-16T00:00:00Z",
    totals,
    by_model: byModel,
    by_day: [{ day: "2026-10-15", ...totals }],
    by_user: userId ? null : [{ user_id: "u_demo", email: "demo@jobfinder.test", ...totals }],
  };
}

const unprocessable = (message: string) => HttpResponse.json({ detail: message }, { status: 422 });
const notFound = (what: string) =>
  HttpResponse.json({ detail: `no ${what} found with this id` }, { status: 404 });

function hostScope(baseUrl: string): string {
  try {
    const parts = new URL(baseUrl).hostname.split(".").filter((p) => p !== "api" && p !== "www");
    return parts.length >= 2 ? parts[parts.length - 2]! : (parts[0] ?? "custom");
  } catch {
    return "custom";
  }
}

// ---------------------------------------------------------------- handlers

export const aiHandlers = [
  // ---- user: models ----
  http.get(`${API}/models`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(catalog(auth.user));
  }),

  http.put(`${API}/models/preferences`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const { preferences = {} } = await readJson<{ preferences: Record<string, string | null> }>(
      request,
    );
    const mine = { ...(aiDb.prefs[auth.user.id] ?? {}) };
    for (const [task, modelId] of Object.entries(preferences)) {
      if (!TASKS.includes(task)) return unprocessable(`Unknown task '${task}'.`);
      if (modelId === null) {
        delete mine[task];
        continue;
      }
      const m = aiDb.models.find((x) => x.id === modelId && x.enabled_global);
      if (!m) return unprocessable("That model isn't available. Pick one from the list.");
      const a = access(auth.user, m);
      if (!a.allowed) return unprocessable(`You can't use ${m.display_name}: ${a.reason}`);
      mine[task] = m.id;
    }
    aiDb.prefs[auth.user.id] = mine;
    return HttpResponse.json(catalog(auth.user));
  }),

  // ---- user: own keys ----
  http.get(`${API}/keys`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const scopes = [...new Set([...aiDb.models.map((m) => m.key_scope), "apify"])].sort();
    return HttpResponse.json({
      keys: aiDb.keys
        .filter((k) => k.owner_type === "user" && k.user_id === auth.user.id)
        .map(masked),
      scopes,
    });
  }),

  http.post(`${API}/keys`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const {
      scope = "",
      key = "",
      label = null,
    } = await readJson<{ scope: string; key: string; label: string | null }>(request);
    if (key.length < 8 || /\s/.test(key)) {
      return unprocessable("That doesn't look like an API key (8-1000 characters, no spaces).");
    }
    const s = scope.trim().toLowerCase();
    aiDb.keys = aiDb.keys.filter(
      (k) => !(k.owner_type === "user" && k.user_id === auth.user.id && k.scope === s),
    );
    const row: MockKey = {
      id: newId("k"),
      owner_type: "user",
      user_id: auth.user.id,
      scope: s,
      label,
      last4: key.slice(-4),
      created_at: new Date().toISOString(),
    };
    aiDb.keys.push(row);
    return HttpResponse.json(masked(row), { status: 201 });
  }),

  http.delete(`${API}/keys/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = aiDb.keys.find(
      (k) => k.id === params.id && k.owner_type === "user" && k.user_id === auth.user.id,
    );
    if (!row) return notFound("key");
    aiDb.keys = aiDb.keys.filter((k) => k !== row);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/usage`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(usage(auth.user.id));
  }),

  // ---- user: job sources ----
  http.get(`${API}/providers`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(providerView(auth.user));
  }),

  http.put(`${API}/providers/settings`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<{ free_only: boolean | null; enabled: Record<string, boolean> }>(
      request,
    );
    const enabled = body.enabled ?? {};
    const unknown = Object.keys(enabled).filter((k) => !aiDb.sources.some((s) => s.key === k));
    if (unknown.length) return unprocessable(`Unknown source(s): ${unknown.join(", ")}`);
    if (typeof body.free_only === "boolean") aiDb.freeOnly[auth.user.id] = body.free_only;
    aiDb.sourceChoices[auth.user.id] = { ...(aiDb.sourceChoices[auth.user.id] ?? {}), ...enabled };
    return HttpResponse.json(providerView(auth.user));
  }),

  // ---- admin: models ----
  http.get(`${API}/admin/models`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(
      [...aiDb.models].sort((a, b) => a.priority - b.priority).map(adminModel),
    );
  }),

  http.post(`${API}/admin/models`, async ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const b = await readJson<MockModel>(request);
    if (!b.provider || !b.model_id || !b.display_name)
      return unprocessable("provider, model_id and display_name are required.");
    if (b.provider === "openai_compatible" && !b.base_url)
      return unprocessable("OpenAI-compatible models need a base_url.");
    if (b.provider !== "openai_compatible" && b.base_url)
      return unprocessable("base_url is only used by openai_compatible models.");
    if (
      aiDb.models.some(
        (m) =>
          m.provider === b.provider &&
          m.model_id === b.model_id &&
          (m.base_url ?? null) === (b.base_url ?? null),
      )
    ) {
      return HttpResponse.json(
        { detail: "This model is already in the registry." },
        { status: 409 },
      );
    }
    const m = model({
      id: newId("m"),
      provider: b.provider,
      model_id: b.model_id,
      display_name: b.display_name,
      tier: b.tier ?? "free",
      tasks: b.tasks ?? [],
      base_url: b.base_url ?? null,
      key_scope:
        b.key_scope || (b.provider === "openai_compatible" ? hostScope(b.base_url!) : b.provider),
      cost_per_1k_in: b.cost_per_1k_in ?? 0,
      cost_per_1k_out: b.cost_per_1k_out ?? 0,
      priority: b.priority ?? 100,
      enabled_global: b.enabled_global ?? true,
      notes: b.notes ?? null,
      last_success_at: null,
    });
    aiDb.models.push(m);
    return HttpResponse.json(adminModel(m), { status: 201 });
  }),

  http.get(`${API}/admin/models/defaults`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({ defaults: aiDb.defaults });
  }),

  http.put(`${API}/admin/models/defaults`, async ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const { defaults = {} } = await readJson<{ defaults: Record<string, string | null> }>(request);
    for (const [task, modelId] of Object.entries(defaults)) {
      if (modelId === null) delete aiDb.defaults[task];
      else if (aiDb.models.some((m) => m.id === modelId)) aiDb.defaults[task] = modelId;
      else return notFound("model");
    }
    return HttpResponse.json({ defaults: aiDb.defaults });
  }),

  http.patch(`${API}/admin/models/:id`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const m = aiDb.models.find((x) => x.id === params.id);
    if (!m) return notFound("model");
    const b = await readJson<Partial<MockModel>>(request);
    Object.assign(m, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)), {
      updated_at: new Date().toISOString(),
    });
    return HttpResponse.json(adminModel(m));
  }),

  http.delete(`${API}/admin/models/:id`, ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    if (!aiDb.models.some((m) => m.id === params.id)) return notFound("model");
    aiDb.models = aiDb.models.filter((m) => m.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${API}/admin/models/:id/test`, ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const m = aiDb.models.find((x) => x.id === params.id);
    if (!m) return notFound("model");
    if (m.provider === "huggingface") {
      return HttpResponse.json({
        ok: false,
        latency_ms: 840,
        key_source: "env",
        error: "HTTP 402 Payment Required",
      });
    }
    m.paused = false;
    m.failures = 0;
    return HttpResponse.json({
      ok: true,
      latency_ms: 612,
      key_source: "platform",
      tokens_in: 21,
      tokens_out: 2,
      reply: "OK",
    });
  }),

  // ---- admin: platform keys ----
  http.get(`${API}/admin/keys`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const platform = aiDb.keys.filter((k) => k.owner_type === "platform");
    const scopes = [
      ...new Set([
        ...aiDb.models.map((m) => m.key_scope),
        ...ENV_SCOPES,
        ...platform.map((k) => k.scope),
      ]),
    ].sort();
    return HttpResponse.json({
      keys: platform.map(masked),
      scopes: scopes.map((scope) => {
        const stored = platform.find((k) => k.scope === scope);
        return {
          scope,
          stored: stored ? masked(stored) : null,
          env_fallback: scope === "huggingface",
        };
      }),
    });
  }),

  http.post(`${API}/admin/keys`, async ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const {
      scope = "",
      key = "",
      label = null,
    } = await readJson<{ scope: string; key: string; label: string | null }>(request);
    if (key.length < 8 || /\s/.test(key)) {
      return unprocessable("That doesn't look like an API key (8-1000 characters, no spaces).");
    }
    const s = scope.trim().toLowerCase();
    aiDb.keys = aiDb.keys.filter((k) => !(k.owner_type === "platform" && k.scope === s));
    const row: MockKey = {
      id: newId("k"),
      owner_type: "platform",
      user_id: null,
      scope: s,
      label,
      last4: key.slice(-4),
      created_at: new Date().toISOString(),
    };
    aiDb.keys.push(row);
    return HttpResponse.json(masked(row), { status: 201 });
  }),

  http.delete(`${API}/admin/keys/:id`, ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const row = aiDb.keys.find((k) => k.id === params.id && k.owner_type === "platform");
    if (!row) return notFound("key");
    aiDb.keys = aiDb.keys.filter((k) => k !== row);
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- admin: job sources ----
  http.get(`${API}/admin/providers`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(
      aiDb.sources.map((s) => ({
        ...s,
        key_configured: s.key_scope ? platformKey(s.key_scope) : null,
        health: health(s),
      })),
    );
  }),

  http.patch(`${API}/admin/providers/:key`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const s = aiDb.sources.find((x) => x.key === params.key);
    if (!s) return HttpResponse.json({ detail: "no job source with this key" }, { status: 404 });
    const b = await readJson<Partial<MockSource>>(request);
    Object.assign(s, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)));
    return HttpResponse.json({
      ...s,
      key_configured: s.key_scope ? platformKey(s.key_scope) : null,
      health: health(s),
    });
  }),

  // ---- admin: usage ----
  http.get(`${API}/admin/usage`, ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    return HttpResponse.json(usage());
  }),

  http.get(`${API}/admin/users/:id/usage`, ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    if (!mockDb.users.some((u) => u.id === params.id)) return notFound("user");
    return HttpResponse.json(usage(String(params.id)));
  }),
];
