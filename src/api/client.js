import axios from "axios";

// Vite dev server proxies /api -> http://localhost:8000 (see vite.config.js)
const client = axios.create({ baseURL: "/api/v1" });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("job_finder_access_token") || "";
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      err.authError =
        err.response.data?.detail ||
        "Your session has expired or is invalid. Please log in again.";
    }
    if (err?.response?.status === 429) {
      err.rateLimitError = "Too many requests — please slow down and try again shortly.";
    }
    return Promise.reject(err);
  }
);

export const health = () => axios.get("/health");

// ---- auth ----
export const registerUser = (payload) => client.post("/auth/register", payload);
export const loginUser = (payload) => client.post("/auth/login", payload);

// ---- search / score / apply / pipeline (Celery task-based, all return {task_id, status, ...}) ----
export const startSearch = (payload) => client.post("/search", payload);
export const startScore = (payload) => client.post("/score", payload);
export const startApply = (payload) => client.post("/apply", payload);

// close now returns {task_id, closed: bool, reason?: string} instead of a bare 200
export const closeApplyBrowser = (taskId) => client.post(`/apply/${taskId}/close`);

// pipeline result, once completed, contains score_result inline and
// apply_task_id (a SEPARATE celery id to poll) instead of an inline apply_result
export const runPipeline = (payload) => client.post("/pipeline/run", payload);

// task_id is now an opaque Celery id (string) — never assume UUID shape
export const getTask = (taskId) => client.get(`/tasks/${taskId}`);

// NOTE: GET /tasks (list-all) no longer exists on the backend — Celery's
// result backend has no "list every task" index. Don't call this from the
// UI; if you need a history view, use GET /applications instead for
// anything already logged, or ask the backend for the side-table index
// mentioned in tasks.py's docstring.

// ---- company ATS (requires login — see auth.py's require_api_key/get_current_user) ----
export const fetchCompanyAts = (payload) => client.post("/company-ats/fetch", payload);

// ---- applications log (sync, paginated + filterable) ----
export const listApplications = (params) => client.get("/applications", { params });
export const getApplication = (index) => client.get(`/applications/${index}`);
export const updateApplicationStatus = (id, status) => client.patch(`/applications/${id}`, { status });
// ---- polling helper ----
// IMPORTANT: GET /tasks/{id} never 404s — an unknown/garbage id reports
// status "pending" forever (Celery can't distinguish "never existed" from
// "queued, not started"). Callers MUST pass a maxAttempts/timeout so a bad
// id doesn't poll forever; this helper enforces that.
export async function pollTask(taskId, { intervalMs = 2500, maxAttempts = 300, onUpdate } = {}) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    const { data } = await getTask(taskId);
    onUpdate?.(data);
    if (data.status === "completed" || data.status === "failed") return data;
    attempts += 1;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Task ${taskId} did not complete after ${maxAttempts} polls (may not exist, or is stuck pending).`);
}

export default client;