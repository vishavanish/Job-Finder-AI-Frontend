/**
 * MSW handlers (spec §4: VITE_USE_MOCKS=true). Every mocked endpoint is listed
 * in docs/frontend-audit.md, "Mocked endpoints". Paths match any origin, so they
 * work with or without VITE_API_BASE_URL.
 *
 * Sign in with any seeded email (admin@, manager@, demo@jobfinder.test) using
 * OTP code 123456 (or password "password123" on the legacy route).
 * disabled@jobfinder.test signs in and is then locked out with 403
 * account_disabled on the next request. "Continue with Google (mock)" signs in
 * as demo@jobfinder.test.
 */
import { delay, http, HttpResponse, type DefaultBodyType, type StrictRequest } from "msw";
import {
  DISABLED_EMAIL,
  FEATURES,
  defaultEntitlements,
  MOCK_OTP_CODE,
  MOCK_PASSWORD,
  entitlementsFor,
  mockDb,
  type MockRun,
  type MockTask,
} from "./data";
import { aiDb, planSources } from "./aiState";
import { enrich, f3Db, setUserJob, userJobs } from "./f3State";
import type { User } from "../lib/api/types";

export const API = "*/api/v1";
const OTP_MAX_ATTEMPTS = 5;
const OTP_SENT = "If this address can sign in, a code has been sent. It expires in 10 minutes.";
const ACCOUNT_DISABLED = {
  detail: {
    code: "account_disabled",
    message: "This account has been disabled. Contact your admin.",
  },
};

// ---- mock refresh "cookie" ----
// A real backend keeps this in an httpOnly cookie. The mock keeps only the user
// id (never a token) so a page reload in mock mode stays signed in.
const SESSION_KEY = "jf_mock_refresh_user";
let refreshUserId: string | null = null;

function getRefreshUser(): string | null {
  try {
    // eslint-disable-next-line no-restricted-globals -- mock-only, holds a user id, not a token
    return refreshUserId ?? sessionStorage.getItem(SESSION_KEY);
  } catch {
    return refreshUserId;
  }
}

function setRefreshUser(id: string | null): void {
  refreshUserId = id;
  try {
    // eslint-disable-next-line no-restricted-globals -- mock-only, holds a user id, not a token
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    // eslint-disable-next-line no-restricted-globals -- mock-only
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // tests / storage blocked: memory only
  }
}

export function resetMockSession(): void {
  setRefreshUser(null);
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}

function issueSession(user: User) {
  const token = newId("mock-access");
  mockDb.tokens.set(token, user.id);
  setRefreshUser(user.id);
  user.last_login_at = new Date().toISOString();
  return { access_token: token, token_type: "bearer", user };
}

function findUserByEmail(email: string): User | undefined {
  return mockDb.users.find((u) => u.email === email.trim().toLowerCase());
}

export type AuthResult = { user: User } | { response: Response };

/** Mirrors get_current_user: 401 without a valid token, 403 for disabled accounts. */
export function authenticate(request: StrictRequest<DefaultBodyType>): AuthResult {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = token ? mockDb.tokens.get(token) : undefined;
  const user = userId ? mockDb.users.find((u) => u.id === userId) : undefined;
  if (!user) {
    return {
      response: HttpResponse.json({ detail: "Could not validate credentials." }, { status: 401 }),
    };
  }
  if (!user.is_active || user.email === DISABLED_EMAIL) {
    return { response: HttpResponse.json(ACCOUNT_DISABLED, { status: 403 }) };
  }
  return { user };
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}

function makeTask(progress: string): MockTask {
  const task: MockTask = {
    id: crypto.randomUUID(),
    polls: 0,
    status: "pending",
    progress,
    createdAt: new Date().toISOString(),
  };
  mockDb.tasks.set(task.id, task);
  return task;
}

function taskResponse(task: MockTask) {
  return {
    task_id: task.id,
    status: task.status,
    created_at: task.createdAt,
    updated_at: new Date().toISOString(),
    progress: task.progress,
    result: task.status === "completed" ? { opened: 1 } : null,
    error: task.status === "failed" ? "Mock failure" : null,
  };
}

export const authHandlers = [
  // ---- Phase 1 (branch phase-1-identity, not on main) ----
  http.post(`${API}/auth/otp/request`, async ({ request }) => {
    const { email = "" } = await readJson<{ email: string }>(request);
    const key = email.trim().toLowerCase();
    const until = mockDb.otpCooldownUntil.get(key) ?? 0;
    const now = Date.now();
    if (until > now) {
      const retryAfter = Math.ceil((until - now) / 1000);
      return HttpResponse.json(
        {
          detail: {
            code: "otp_cooldown",
            retry_after: retryAfter,
            message: "Please wait before requesting another code.",
          },
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    mockDb.otpCooldownUntil.set(key, now + 60_000);
    mockDb.otpAttempts.set(key, 0);
    return HttpResponse.json({ detail: OTP_SENT }, { status: 202 });
  }),

  http.post(`${API}/auth/otp/verify`, async ({ request }) => {
    const { email = "", code = "" } = await readJson<{ email: string; code: string }>(request);
    const key = email.trim().toLowerCase();
    // Same codes as the backend (otp.check_code): a code exists only after a request.
    if (!mockDb.otpAttempts.has(key)) {
      return HttpResponse.json(
        {
          detail: {
            code: "otp_expired",
            message: "This code has expired or was already used. Request a new code.",
          },
        },
        { status: 400 },
      );
    }
    const attempts = (mockDb.otpAttempts.get(key) ?? 0) + 1;
    mockDb.otpAttempts.set(key, attempts);
    const user = findUserByEmail(key);
    if (code === MOCK_OTP_CODE && user && attempts <= OTP_MAX_ATTEMPTS) {
      mockDb.otpAttempts.delete(key);
      return HttpResponse.json(issueSession(user));
    }
    const left = OTP_MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      mockDb.otpAttempts.delete(key);
      return HttpResponse.json(
        {
          detail: {
            code: "otp_locked",
            attempts_left: 0,
            message: "Too many wrong attempts. Request a new code.",
          },
        },
        { status: 400 },
      );
    }
    return HttpResponse.json(
      {
        detail: {
          code: "otp_invalid",
          attempts_left: left,
          message: `That code isn't right. ${left} attempt${left === 1 ? "" : "s"} left.`,
        },
      },
      { status: 400 },
    );
  }),

  http.post(`${API}/auth/google`, async ({ request }) => {
    const { id_token = "" } = await readJson<{ id_token: string }>(request);
    if (!id_token) {
      return HttpResponse.json(
        { detail: "Google sign-in failed. Please try again." },
        { status: 401 },
      );
    }
    const user = mockDb.users.find((u) => u.id === "u_demo");
    return HttpResponse.json(issueSession(user!));
  }),

  http.post(`${API}/auth/refresh`, () => {
    const userId = getRefreshUser();
    const user = userId ? mockDb.users.find((u) => u.id === userId) : undefined;
    if (!user) {
      return HttpResponse.json({ detail: "Missing or invalid refresh token." }, { status: 401 });
    }
    if (!user.is_active) return HttpResponse.json(ACCOUNT_DISABLED, { status: 403 });
    return HttpResponse.json(issueSession(user));
  }),

  http.post(`${API}/auth/logout`, () => {
    setRefreshUser(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${API}/auth/me`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    return HttpResponse.json({ ...auth.user, entitlements: entitlementsFor(auth.user.id) });
  }),

  http.get(`${API}/auth/me/entitlements`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const ent = entitlementsFor(auth.user.id);
    return HttpResponse.json(
      FEATURES.map((feature) => {
        const e = ent[feature]!;
        return {
          feature,
          enabled: e.enabled,
          quota_per_day: e.quota_per_day,
          max_level: e.max_level,
          expires_at: null,
          source: "default",
          used_today:
            e.quota_per_day != null && e.quota_remaining != null
              ? e.quota_per_day - e.quota_remaining
              : null,
        };
      }),
    );
  }),

  // ---- On main today; mocked so mock mode is self-contained ----
  http.post(`${API}/auth/login`, async ({ request }) => {
    const { email = "", password = "" } = await readJson<{ email: string; password: string }>(
      request,
    );
    const user = findUserByEmail(email);
    if (!user || password !== MOCK_PASSWORD) {
      return HttpResponse.json({ detail: "Incorrect email or password." }, { status: 401 });
    }
    return HttpResponse.json(issueSession(user));
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    const { email = "", name = null } = await readJson<{ email: string; name: string | null }>(
      request,
    );
    if (findUserByEmail(email)) {
      return HttpResponse.json(
        { detail: "An account with this email already exists." },
        { status: 409 },
      );
    }
    const user: User = {
      id: newId("u"),
      email: email.trim().toLowerCase(),
      name,
      role: "user",
      is_active: true,
      manager_id: null,
      auth_provider: "password",
      email_verified_at: null,
      last_login_at: null,
    };
    mockDb.users.push(user);
    return HttpResponse.json(issueSession(user), { status: 201 });
  }),
];

export const workHandlers = [
  http.post(`${API}/pipeline/run/stream`, async ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const body = await readJson<{
      search: { sources?: string[]; enable_naukri_apify?: boolean };
      search_profile_id?: string;
      include_seen?: boolean;
    }>(request);
    // Like the backend (P3): profile mode needs the user's own profile and a resume.
    if (body.search_profile_id) {
      const owned = (f3Db.searchProfiles[auth.user.id] ?? []).some(
        (p) => p.id === body.search_profile_id,
      );
      if (!owned) {
        return HttpResponse.json(
          {
            detail: {
              code: "search_profile_not_found",
              message: "No search profile with this id.",
            },
          },
          { status: 404 },
        );
      }
      if (!(f3Db.resumes[auth.user.id] ?? []).length) {
        return HttpResponse.json(
          {
            detail: {
              code: "resume_required",
              message: "Upload a resume before searching with a profile.",
            },
          },
          { status: 422 },
        );
      }
    }
    // Sources left out of the request: every source that can run, skipped ones not reported (P3.1).
    const requested =
      body.search?.sources ??
      aiDb.sources
        .map((s) => s.key)
        .filter(
          (k) =>
            k !== "naukri" && k !== "naukri_apify" && k !== "email_alerts" && k !== "company_ats",
        );
    const plan = planSources(auth.user, requested, Boolean(body.search?.enable_naukri_apify));
    // Like the backend: with no sources named, sources that can't run are left out quietly.
    if (!body.search?.sources) plan.skipped = [];
    if (!plan.sources.length && !plan.apify) {
      return HttpResponse.json(
        {
          detail: {
            code: "no_sources_available",
            message: "None of the selected job sources can run: " + plan.skipped.join("; "),
            skipped: plan.skipped,
          },
        },
        { status: 422 },
      );
    }
    // Canonical jobs with stable ids; seen/saved/hidden/applied ones are skipped unless include_seen.
    const mine = userJobs(auth.user.id);
    const jobs = mockDb.sampleJobs
      .map((j, i) => enrich(j, i))
      .filter((j) => body.include_seen || !mine[j.id]);
    for (const j of jobs) {
      f3Db.jobs.set(j.id, j);
      if (!mine[j.id]) setUserJob(auth.user.id, j.id, "seen");
    }
    // A better copy of the first job turns up later: same id, replaces: true (backend P3).
    const first = jobs[0];
    if (first) jobs.push({ ...first, applicants: "Over 200", replaces: true });
    const run: MockRun = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      jobs,
      delivered: 0,
      status: "running",
      userId: auth.user.id,
      skipped: plan.skipped,
    };
    mockDb.runs.set(run.id, run);
    return HttpResponse.json({ run_id: run.id, skipped_sources: plan.skipped }, { status: 202 });
  }),

  // Before /pipeline/:runId so "runs" isn't read as a run id.
  http.get(`${API}/pipeline/runs/latest`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = [...mockDb.runs.values()]
      .filter((r) => r.userId === auth.user.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!run) return HttpResponse.json({ detail: "no recent search" }, { status: 404 });
    return HttpResponse.json({
      run_id: run.id,
      user_id: auth.user.id,
      status: run.status,
      total_keywords: 3,
      keywords_completed: run.status === "running" ? 0 : 3,
      error: null,
      created_at: new Date(run.createdAt).toISOString(),
      keywords: [],
      skipped_sources: run.skipped ?? [],
    });
  }),

  http.get(`${API}/pipeline/:runId`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = mockDb.runs.get(String(params.runId));
    if (!run) return HttpResponse.json({ detail: "no run found with this id" }, { status: 404 });
    return HttpResponse.json({
      user_id: auth.user.id,
      status: run.status,
      total_keywords: 3,
      keywords_completed: run.jobs.length
        ? Math.min(3, Math.floor((run.delivered / run.jobs.length) * 3))
        : 3,
      error: "",
      created_at: new Date(run.createdAt).toISOString(),
    });
  }),

  http.get(`${API}/pipeline/:runId/jobs`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = mockDb.runs.get(String(params.runId));
    if (!run) return HttpResponse.json({ detail: "no run found with this id" }, { status: 404 });
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    // Release two more jobs per poll until all are out (none after a cancel).
    if (run.status === "running") {
      run.delivered = Math.min(run.jobs.length, Math.max(run.delivered, offset) + 2);
      if (run.delivered >= run.jobs.length) run.status = "completed";
    }
    await delay(150);
    const jobs = run.jobs.slice(offset, run.delivered);
    return HttpResponse.json({ run_status: run.status, jobs, next_offset: offset + jobs.length });
  }),

  http.post(`${API}/pipeline/:runId/cancel`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const run = mockDb.runs.get(String(params.runId));
    if (!run) return HttpResponse.json({ detail: "no run found with this id" }, { status: 404 });
    if (run.status === "running") run.status = "cancelled";
    return HttpResponse.json({
      run_id: run.id,
      user_id: auth.user.id,
      status: run.status,
      total_keywords: 3,
      keywords_completed: 3,
      error: run.status === "cancelled" ? "cancelled by you" : null,
    });
  }),

  http.post(`${API}/apply`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const task = makeTask("Opening the job page…");
    return HttpResponse.json(taskResponse(task), { status: 202 });
  }),

  http.get(`${API}/tasks/:taskId`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const task = mockDb.tasks.get(String(params.taskId));
    if (!task) return HttpResponse.json({ detail: "Task not found." }, { status: 404 });
    task.polls += 1;
    if (task.status === "pending") task.status = "running";
    else if (task.status === "running" && task.polls >= 3) {
      task.status = "completed";
      task.progress = "Form prefilled. Review it in the browser before submitting.";
    }
    return HttpResponse.json(taskResponse(task));
  }),

  http.post(`${API}/tasks/:taskId/cancel`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const id = String(params.taskId);
    const task = mockDb.tasks.get(id);
    if (task) {
      task.status = "failed";
      task.progress = "Cancelled";
      return HttpResponse.json({ task_id: id, status: "cancelled" });
    }
    // Like the backend since Phase 0: a run_id is not a task id.
    return HttpResponse.json({ detail: "Task not found." }, { status: 404 });
  }),

  http.get(`${API}/applications`, ({ request }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const rows = mockDb.applications;
    return HttpResponse.json({
      applications: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
    });
  }),

  http.get(`${API}/applications/:id`, ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = mockDb.applications.find((a) => a.id === params.id);
    return row
      ? HttpResponse.json(row)
      : HttpResponse.json({ detail: "Application not found." }, { status: 404 });
  }),

  http.patch(`${API}/applications/:id`, async ({ request, params }) => {
    const auth = authenticate(request);
    if ("response" in auth) return auth.response;
    const row = mockDb.applications.find((a) => a.id === params.id);
    if (!row) return HttpResponse.json({ detail: "Application not found." }, { status: 404 });
    const { status } = await readJson<{ status: string }>(request);
    if (status) {
      row.status = status;
      row.status_source = "manual";
      row.updated_at = new Date().toISOString();
    }
    return HttpResponse.json(row);
  }),
];

// ---- Admin console (backend routes/admin.py) ----

const FORBIDDEN = { detail: "You don't have permission to do this." };
const NO_USER = { detail: "no user found with this id" };

export function requireRole(request: StrictRequest<DefaultBodyType>, roles: string[]): AuthResult {
  const auth = authenticate(request);
  if ("response" in auth) return auth;
  if (!roles.includes(auth.user.role)) {
    return { response: HttpResponse.json(FORBIDDEN, { status: 403 }) };
  }
  return auth;
}

/** Admins manage everyone; managers only their team (manager_id = their id). */
function manageable(actor: User, id: string): User | undefined {
  const target = mockDb.users.find((u) => u.id === id);
  if (!target) return undefined;
  if (actor.role === "admin" || target.manager_id === actor.id) return target;
  return undefined;
}

function entitlementOut(userId: string, feature: string) {
  const e = entitlementsFor(userId)[feature]!;
  return {
    feature,
    enabled: e.enabled,
    quota_per_day: e.quota_per_day ?? null,
    max_level: e.max_level ?? null,
    expires_at: null,
    source: mockDb.overrides[userId]?.has(feature) ? "override" : "default",
    used_today:
      e.quota_per_day != null && e.quota_remaining != null
        ? e.quota_per_day - e.quota_remaining
        : 0,
  };
}

export const adminHandlers = [
  http.get(`${API}/admin/users`, ({ request }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const role = url.searchParams.get("role");
    const active = url.searchParams.get("active");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const rows = mockDb.users.filter(
      (u) =>
        (auth.user.role === "admin" || u.manager_id === auth.user.id) &&
        (!q || u.email.includes(q) || (u.name ?? "").toLowerCase().includes(q)) &&
        (!role || u.role === role) &&
        (active === null || String(u.is_active) === active),
    );
    return HttpResponse.json({
      users: rows.slice(offset, offset + limit),
      total: rows.length,
      limit,
      offset,
    });
  }),

  http.post(`${API}/admin/users`, async ({ request }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const body = await readJson<{ email: string; name: string | null; role: string }>(request);
    const email = (body.email ?? "").trim().toLowerCase();
    if (findUserByEmail(email)) {
      return HttpResponse.json(
        { detail: "An account with this email already exists." },
        { status: 409 },
      );
    }
    const user: User = {
      id: newId("u"),
      email,
      name: body.name ?? null,
      role: body.role ?? "user",
      is_active: true,
      manager_id: null,
      auth_provider: null,
      email_verified_at: null,
      last_login_at: null,
    };
    mockDb.users.push(user);
    return HttpResponse.json(user, { status: 201 });
  }),

  http.get(`${API}/admin/users/:id`, ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    return target ? HttpResponse.json(target) : HttpResponse.json(NO_USER, { status: 404 });
  }),

  http.patch(`${API}/admin/users/:id`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    if (!target) return HttpResponse.json(NO_USER, { status: 404 });
    const body = await readJson<{ role: string; name: string | null }>(request);
    if (body.role && target.id === auth.user.id) {
      return HttpResponse.json({ detail: "You can't change your own role." }, { status: 400 });
    }
    if (body.role) target.role = body.role;
    if (body.name !== undefined) target.name = body.name;
    return HttpResponse.json(target);
  }),

  http.post(`${API}/admin/users/:id/:action`, ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    if (!target) return HttpResponse.json(NO_USER, { status: 404 });
    const action = String(params.action);
    if (action === "revoke-sessions") {
      for (const [token, uid] of mockDb.tokens) if (uid === target.id) mockDb.tokens.delete(token);
      return new HttpResponse(null, { status: 204 });
    }
    if (action !== "enable" && action !== "disable") {
      return HttpResponse.json({ detail: "Not Found" }, { status: 404 });
    }
    if (action === "disable" && target.id === auth.user.id) {
      return HttpResponse.json({ detail: "You can't disable your own account." }, { status: 400 });
    }
    target.is_active = action === "enable";
    return HttpResponse.json(target);
  }),

  http.get(`${API}/admin/features`, ({ request }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const defaults = defaultEntitlements();
    return HttpResponse.json(
      FEATURES.map((feature) => ({
        feature,
        enabled: defaults[feature]!.enabled,
        quota_per_day: defaults[feature]!.quota_per_day ?? null,
        max_level: defaults[feature]!.max_level ?? null,
        expires_at: null,
        source: "default",
        used_today: null,
      })),
    );
  }),

  http.get(`${API}/admin/users/:id/entitlements`, ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    if (!target) return HttpResponse.json(NO_USER, { status: 404 });
    return HttpResponse.json(FEATURES.map((f) => entitlementOut(target.id, f)));
  }),

  http.put(`${API}/admin/users/:id/entitlements/:feature`, async ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    if (!target) return HttpResponse.json(NO_USER, { status: 404 });
    const feature = String(params.feature);
    const body = await readJson<{
      enabled: boolean;
      quota_per_day: number | null;
      max_level: number | null;
    }>(request);
    const ent = entitlementsFor(target.id);
    const used = entitlementOut(target.id, feature).used_today ?? 0;
    const quota = body.quota_per_day ?? null;
    ent[feature] = {
      enabled: Boolean(body.enabled),
      quota_per_day: quota,
      max_level: body.max_level ?? null,
      quota_remaining: quota == null ? null : Math.max(0, quota - used),
    };
    (mockDb.overrides[target.id] ??= new Set()).add(feature);
    return HttpResponse.json(entitlementOut(target.id, feature));
  }),

  http.delete(`${API}/admin/users/:id/entitlements/:feature`, ({ request, params }) => {
    const auth = requireRole(request, ["admin", "manager"]);
    if ("response" in auth) return auth.response;
    const target = manageable(auth.user, String(params.id));
    if (!target) return HttpResponse.json(NO_USER, { status: 404 });
    const feature = String(params.feature);
    entitlementsFor(target.id)[feature] = defaultEntitlements()[feature]!;
    mockDb.overrides[target.id]?.delete(feature);
    return HttpResponse.json(entitlementOut(target.id, feature));
  }),
];

export const handlers = [...authHandlers, ...adminHandlers, ...workHandlers];
