import axios from "axios";

const API_URL = "https://jobfinderai.duckdns.org";

const client = axios.create({
  baseURL: `${API_URL}/api/v1`,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("job_finder_access_token") || "";

  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

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
      err.rateLimitError =
        "Too many requests — please slow down and try again shortly.";
    }

    return Promise.reject(err);
  }
);

export const health = () => client.get("/health");

// ---- auth ----
export const registerUser = (payload) =>
  client.post("/auth/register", payload);

export const loginUser = (payload) =>
  client.post("/auth/login", payload);

// ---- search / score / apply / pipeline ----
export const startSearch = (payload) => client.post("/search", payload);
export const startScore = (payload) => client.post("/score", payload);
export const startApply = (payload) => client.post("/apply", payload);

export const closeApplyBrowser = (taskId) =>
  client.post(`/apply/${taskId}/close`);

export const runPipeline = (payload) =>
  client.post("/pipeline/run", payload);

export const getTask = (taskId) =>
  client.get(`/tasks/${taskId}`);

export const cancelTask = (taskId) =>
  client.post(`/tasks/${taskId}/cancel`);

export const fetchCompanyAts = (payload) =>
  client.post("/company-ats/fetch", payload);

export const listApplications = (params) =>
  client.get("/applications", { params });

export const getApplication = (index) =>
  client.get(`/applications/${index}`);

export const updateApplicationStatus = (id, status) =>
  client.patch(`/applications/${id}`, { status });

export async function pollTask(
  taskId,
  { intervalMs = 2500, maxAttempts = 300, onUpdate } = {}
) {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const { data } = await getTask(taskId);

    onUpdate?.(data);

    if (
      data.status === "completed" ||
      data.status === "failed" ||
      data.status === "cancelled"
    ) {
      return data;
    }

    attempts += 1;

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Task ${taskId} did not complete after ${maxAttempts} polls (may not exist, or is stuck pending).`
  );
}

export default client;