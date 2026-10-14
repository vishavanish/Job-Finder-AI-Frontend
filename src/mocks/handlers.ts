/**
 * MSW handlers (spec §4: VITE_USE_MOCKS=true). Every mocked endpoint is listed
 * in docs/frontend-audit.md, "Mocked endpoints". Paths match any origin, so they
 * work with or without VITE_API_BASE_URL.
 *
 * Sign in with any seeded email (admin@jobfinder.test, demo@jobfinder.test) using
 * OTP code 123456 or password "password123". disabled@jobfinder.test signs in and
 * is then locked out with 403 account_disabled on the next request.
 */
import { delay, http, HttpResponse, type DefaultBodyType, type StrictRequest } from "msw";
import {
  DISABLED_EMAIL,
  FEATURES,
  MOCK_OTP_CODE,
  MOCK_PASSWORD,
  entitlementsFor,
  mockDb,
  type MockRun,
  type MockTask,
} from "./data";
import type { User } from "../lib/api/types";

const API = "*/api/v1";
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
function newId(prefix: string): string {
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

type AuthResult = { user: User } | { response: Response };

/** Mirrors get_current_user: 401 without a valid token, 403 for disabled accounts. */
function authenticate(request: StrictRequest<DefaultBodyType>): AuthResult {
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

async function readJson<T>(request: Request): Promise<Partial<T>> {
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
        { detail: "Please wait before requesting another code." },
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
    const attempts = (mockDb.otpAttempts.get(key) ?? 0) + 1;
    mockDb.otpAttempts.set(key, attempts);
    const user = findUserByEmail(key);
    if (!user || code !== MOCK_OTP_CODE || attempts > 5) {
      return HttpResponse.json({ detail: "Invalid or expired code." }, { status: 400 });
    }
    return HttpResponse.json(issueSession(user));
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
    const run: MockRun = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      jobs: mockDb.sampleJobs.map((j) => ({
        ...j,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      })),
      delivered: 0,
      status: "running",
    };
    mockDb.runs.set(run.id, run);
    return HttpResponse.json({ run_id: run.id }, { status: 202 });
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
      keywords_completed: Math.min(3, Math.floor((run.delivered / run.jobs.length) * 3)),
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
    // Release two more jobs per poll until all are out.
    run.delivered = Math.min(run.jobs.length, Math.max(run.delivered, offset) + 2);
    if (run.delivered >= run.jobs.length && run.status === "running") run.status = "completed";
    await delay(150);
    return HttpResponse.json({
      run_status: run.status,
      jobs: run.jobs.slice(offset, run.delivered),
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

export const handlers = [...authHandlers, ...workHandlers];
